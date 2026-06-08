import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";

// NeoDB covers are downloaded into public/covers during render, which happens
// after Astro copies public/ → dist/. This copies them into the output so a
// fresh single build ships them.
function copyNeodbCovers() {
  return {
    name: "copy-neodb-covers",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const { cp, access } = await import("node:fs/promises");
        const { fileURLToPath } = await import("node:url");
        try {
          await access("public/covers");
          await cp("public/covers", fileURLToPath(new URL("covers", dir)), { recursive: true });
          logger.info("copied NeoDB covers → dist/covers");
        } catch {
          /* no covers cached — nothing to copy */
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://somlar.com",
  integrations: [react(), sitemap(), icon(), copyNeodbCovers()],
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: "viewport",
  },
});
