#!/usr/bin/env node
/**
 * Migrate Hugo blog posts to Astro content collection format.
 * Usage: node scripts/migrate-hugo.mjs <hugo-content-dir>
 * Example: node scripts/migrate-hugo.mjs ../blogs/content/blogs
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

const HUGO_DIR = process.argv[2];
if (!HUGO_DIR) {
  console.error("Usage: node scripts/migrate-hugo.mjs <hugo-content-dir>");
  process.exit(1);
}

const OUT_DIR = join(import.meta.dirname, "..", "src", "content", "blog");
await mkdir(OUT_DIR, { recursive: true });

const files = (await readdir(HUGO_DIR)).filter(
  (f) => f.endsWith(".md") && f !== "_index.md"
);

let migrated = 0;
let skipped = 0;

for (const file of files) {
  const raw = await readFile(join(HUGO_DIR, file), "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    console.warn(`  SKIP (no frontmatter): ${file}`);
    skipped++;
    continue;
  }

  const fmBlock = fmMatch[1];
  const body = raw.slice(fmMatch[0].length).trimStart();

  const get = (key) => {
    const m = fmBlock.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    if (!m) return null;
    let val = m[1].trim();
    // Strip YAML inline comments: "value"  # comment  →  "value"
    if (/^["']/.test(val)) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      if (end > 0) val = val.slice(0, end + 1);
    } else {
      val = val.replace(/\s+#.*$/, "");
    }
    return val.replace(/^["']|["']$/g, "");
  };

  const title = get("title") || basename(file, ".md");
  const date = get("date") || "2024-01-01T00:00:00+08:00";
  const lastmod = get("lastmod");
  const draft = get("draft") === "true";
  const slug = get("slug") || basename(file, ".md");
  const description = get("description") || "";

  // Parse tags array
  const tagsMatch = fmBlock.match(/^tags:\s*\[([^\]]*)\]/m);
  const tags = tagsMatch
    ? tagsMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : [];

  // Parse categories
  const catMatch = fmBlock.match(/^categories:\s*\[([^\]]*)\]/m);
  const categories = catMatch
    ? catMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : [];

  // Handle cover image (both formats)
  let coverBlock = "";
  const coverImageMatch = fmBlock.match(/^\s*image:\s*"([^"]+)"/m);
  const coverAltMatch = fmBlock.match(/^\s*alt:\s*"([^"]+)"/m);
  const featuredImage = get("featured_image");

  if (coverImageMatch) {
    coverBlock = `cover:\n  image: "${coverImageMatch[1]}"\n  alt: "${coverAltMatch ? coverAltMatch[1] : ""}"`;
  } else if (featuredImage) {
    coverBlock = `cover:\n  image: "${featuredImage}"\n  alt: ""`;
  }

  // Build new frontmatter
  const lines = [
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
  ];
  if (lastmod) lines.push(`lastmod: ${lastmod}`);
  if (draft) lines.push(`draft: true`);
  lines.push(`slug: "${slug}"`);
  if (description) lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
  if (tags.length) lines.push(`tags: [${tags.map((t) => `"${t}"`).join(", ")}]`);
  if (categories.length) lines.push(`categories: [${categories.map((c) => `"${c}"`).join(", ")}]`);
  if (coverBlock) lines.push(coverBlock);

  const outContent = `---\n${lines.join("\n")}\n---\n\n${body}`;
  const outFile = `${slug}.md`;

  await writeFile(join(OUT_DIR, outFile), outContent, "utf-8");
  migrated++;
  console.log(`  OK: ${file} → ${outFile}`);
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped.`);
