export const siteConfig = {
  title: "Somlar",
  description: "A calm home for experiments, writing, and projects.",
  url: "https://somlar.com",
  author: "Somlar",
  nav: [
    { label: "Blog", href: "/blog" },
    { label: "Projects", href: "/projects" },
    { label: "Labs", href: "/labs" },
    { label: "About", href: "/about" },
  ],
  twikoo: {
    envId: import.meta.env.PUBLIC_TWIKOO_ENV_ID || "",
  },
} as const;
