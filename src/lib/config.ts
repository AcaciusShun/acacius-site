export const siteConfig = {
  title: "Somlar",
  description: "Somlar 的个人站点 — 技术笔记、开源项目与实验记录。",
  url: "https://somlar.com",
  author: "Somlar",
  mastodon: "https://m.somincola.org/@acacius",
  nav: [
    { label: "Blog", href: "/blog" },
    { label: "Projects", href: "/projects" },
    { label: "Labs", href: "/labs" },
    { label: "Library", href: "/library" },
    { label: "About", href: "/about" },
  ],
  twikoo: {
    envId: import.meta.env.PUBLIC_TWIKOO_ENV_ID || "",
  },
} as const;
