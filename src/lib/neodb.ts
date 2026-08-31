// Build-time fetch of NeoDB marks → LibraryItem[].
//
// Runs only during `astro build` / `astro dev` (server side), so the token
// from .env (NEODB_TOKEN) is never bundled into client code.
//
// Endpoints used (Bearer auth, read scope):
//   GET /api/me/shelf/{type}?page=N   → { data: Mark[], pages, count }
// where type ∈ wishlist | progress | complete | dropped.

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import librarySnapshot from "../data/library-snapshot.json";
import { siteConfig } from "./config";

export type MediaCategory = "book" | "movie" | "tv" | "music" | "game" | "podcast";
export type ShelfType = "wishlist" | "progress" | "complete" | "dropped";

export interface LibraryItem {
  uuid: string;
  category: string; // NeoDB category; usually a MediaCategory
  title: string;
  cover: string | null;
  rating: number | null; // 1–10, null if unrated
  comment: string;
  tags: string[];
  date: string; // YYYY-MM-DD (mark.created_time)
  shelf: ShelfType;
  url: string;
  communityRating?: number | null; // item.rating (0–10 average)
  ratingCount?: number | null;
  description?: string; // item synopsis
}

const snapshotItems = librarySnapshot as LibraryItem[];

function useSnapshot(reason: string): LibraryItem[] {
  if (snapshotItems.length === 0) {
    throw new Error(`[neodb] ${reason}; committed Library snapshot is empty.`);
  }
  console.warn(`[neodb] ${reason} — using committed Library snapshot (${snapshotItems.length} items).`);
  return snapshotItems;
}

const SHELF_TYPES: ShelfType[] = ["complete", "progress", "wishlist", "dropped"];

interface NeoMark {
  shelf_type: ShelfType;
  created_time: string;
  comment_text: string | null;
  rating_grade: number | null;
  tags: string[];
  item: {
    uuid: string;
    category: string;
    display_title?: string;
    title?: string;
    cover_image_url: string | null;
    url: string;
    description?: string;
    rating?: number | null;
    rating_count?: number | null;
  };
}

// Route covers through Cloudflare Image Transformations on our own zone, so they
// serve from somlar.com (reachable in mainland China, unlike neodb.social) and
// are resized + reformatted (WebP/AVIF) at the edge. Requires the zone's
// Transformations to allow neodb.social as a source origin.
const COVER_PREFIX = `${siteConfig.url.replace(/\/$/, "")}/cdn-cgi/image/width=400,quality=80,format=auto`;
const transformCover = (url: string): string => `${COVER_PREFIX}/${url}`;

function mapMark(m: NeoMark, base: string): LibraryItem {
  const it = m.item;
  const url = it.url?.startsWith("http") ? it.url : base + it.url;
  return {
    uuid: it.uuid,
    category: it.category,
    title: it.display_title || it.title || "Untitled",
    cover: it.cover_image_url ? transformCover(it.cover_image_url) : null,
    rating: m.rating_grade ?? null,
    comment: m.comment_text || "",
    tags: m.tags || [],
    date: (m.created_time || "").slice(0, 10),
    shelf: m.shelf_type,
    url,
    communityRating: it.rating ?? null,
    ratingCount: it.rating_count ?? null,
    description: it.description || "",
  };
}

// Fetch JSON with retry + backoff, so a transient blip (or 429/5xx) during a
// build doesn't sink the whole sync into the sample-data fallback.
async function fetchJson(url: string, token: string, retries = 3): Promise<{ data: NeoMark[]; pages: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) return res.json();
      // Don't retry real client errors (401/403/404…); do retry 429 / 5xx.
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw lastErr;
}

async function fetchShelf(type: ShelfType, base: string, token: string): Promise<NeoMark[]> {
  const out: NeoMark[] = [];
  let page = 1;
  let pages = 1;
  do {
    const json = await fetchJson(`${base}/api/me/shelf/${type}?page=${page}`, token);
    out.push(...json.data);
    pages = json.pages || 1;
    page += 1;
  } while (page <= pages);
  return out;
}

// ─── Dev cache ───
// In `astro dev` the page frontmatter re-runs on every request, so without a
// cache each /library load re-hits the NeoDB API (~10 calls) → slow & pending.
// Cache the result on disk; dev reads it, `astro build` always refetches fresh.

const CACHE_FILE = path.resolve("node_modules/.cache/neodb/items.json");
const DEV_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function readDevCache(): LibraryItem[] | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    if (Date.now() - statSync(CACHE_FILE).mtimeMs > DEV_CACHE_TTL) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as LibraryItem[];
  } catch {
    return null;
  }
}

async function writeDevCache(items: LibraryItem[]): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(items));
  } catch {
    /* cache is best-effort */
  }
}

let memo: Promise<LibraryItem[]> | null = null;

// Memoized so multiple pages (home + /library) share a single fetch per process.
export function fetchLibraryItems(): Promise<LibraryItem[]> {
  if (!memo) memo = loadLibraryItems();
  return memo;
}

async function loadLibraryItems(): Promise<LibraryItem[]> {
  if (import.meta.env.DEV) {
    const cached = readDevCache();
    if (cached) {
      console.log(`[neodb] dev cache hit (${cached.length} items)`);
      return cached;
    }
  }
  const token = import.meta.env.NEODB_TOKEN ?? process.env.NEODB_TOKEN;
  const base = (import.meta.env.NEODB_INSTANCE ?? process.env.NEODB_INSTANCE ?? "https://neodb.social").replace(/\/$/, "");

  if (!token) {
    return useSnapshot("NEODB_TOKEN not set");
  }

  try {
    const marks = (await Promise.all(SHELF_TYPES.map((t) => fetchShelf(t, base, token)))).flat();
    const items = marks.map((m) => mapMark(m, base));
    items.sort((a, b) => b.date.localeCompare(a.date));
    console.log(`[neodb] fetched ${items.length} marks from ${base} (covers via Cloudflare transform)`);
    await writeDevCache(items);
    return items;
  } catch (err) {
    return useSnapshot(`fetch failed (${(err as Error).message})`);
  }
}
