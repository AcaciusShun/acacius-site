import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";

export default defineConfig({
  site: "https://somlar.com",
  integrations: [react(), sitemap(), icon()],
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
