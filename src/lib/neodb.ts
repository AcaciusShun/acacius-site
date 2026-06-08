// Build-time fetch of NeoDB marks → LibraryItem[].
//
// Runs only during `astro build` / `astro dev` (server side), so the token
// from .env (NEODB_TOKEN) is never bundled into client code.
//
// Endpoints used (Bearer auth, read scope):
//   GET /api/me/shelf/{type}?page=N   → { data: Mark[], pages, count }
// where type ∈ wishlist | progress | complete | dropped.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { libraryItems as sampleItems } from "./library-sample";

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

function mapMark(m: NeoMark, base: string): LibraryItem {
  const it = m.item;
  const url = it.url?.startsWith("http") ? it.url : base + it.url;
  return {
    uuid: it.uuid,
    category: it.category,
    title: it.display_title || it.title || "Untitled",
    cover: it.cover_image_url || null,
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

async function fetchShelf(type: ShelfType, base: string, token: string): Promise<NeoMark[]> {
  const out: NeoMark[] = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await fetch(`${base}/api/me/shelf/${type}?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`NeoDB ${type} p${page} → HTTP ${res.status}`);
    const json = (await res.json()) as { data: NeoMark[]; pages: number };
    out.push(...json.data);
    pages = json.pages || 1;
    page += 1;
  } while (page <= pages);
  return out;
}

// ─── Build-time cover optimization ───
// Download each cover, resize to a small WebP, and serve it from /covers/
// on our own domain. Cached on disk (keyed by URL hash) so later rebuilds
// only download new covers. Falls back to the remote URL if anything fails.

const COVER_DIR = path.resolve("public/covers");
const COVER_WIDTH = 320;
let coverDirReady = false;

async function localizeCover(remoteUrl: string): Promise<string> {
  const name = createHash("sha1").update(remoteUrl).digest("hex").slice(0, 16) + ".webp";
  const outPath = path.join(COVER_DIR, name);
  const publicPath = `/covers/${name}`;
  if (existsSync(outPath)) return publicPath; // cache hit
  try {
    if (!coverDirReady) {
      await mkdir(COVER_DIR, { recursive: true });
      coverDirReady = true;
    }
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input)
      .resize({ width: COVER_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(outPath, out);
    return publicPath;
  } catch {
    return remoteUrl; // graceful fallback to hotlink
  }
}

async function localizeCovers(items: LibraryItem[], concurrency = 6): Promise<void> {
  let i = 0;
  let local = 0;
  let fallback = 0;
  async function worker() {
    while (i < items.length) {
      const it = items[i++];
      if (!it.cover) continue;
      it.cover = await localizeCover(it.cover);
      if (it.cover.startsWith("/covers/")) local++;
      else fallback++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  console.log(`[neodb] covers: ${local} local, ${fallback} hotlinked (fallback)`);
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
    console.warn("[neodb] NEODB_TOKEN not set — falling back to sample data.");
    return sampleItems;
  }

  try {
    const marks = (await Promise.all(SHELF_TYPES.map((t) => fetchShelf(t, base, token)))).flat();
    const items = marks.map((m) => mapMark(m, base));
    items.sort((a, b) => b.date.localeCompare(a.date));
    console.log(`[neodb] fetched ${items.length} marks from ${base}`);
    await localizeCovers(items);
    await writeDevCache(items);
    return items;
  } catch (err) {
    console.warn(`[neodb] fetch failed (${(err as Error).message}) — falling back to sample data.`);
    return sampleItems;
  }
}
