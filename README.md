# Somlar

Personal site and digital study — built with [Astro 6](https://astro.build/), featuring editorial typography, light/dark themes, and a curated content system.

**[somlar.com](https://somlar.com)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cdn.somlar.com/2026/05/3453905c627e7c1b32053d5c24ea285e.png">
  <img src="https://cdn.somlar.com/2026/05/4fdcb030683575bc2f2843b770c4c924.png" alt="Somlar — homepage preview">
</picture>

## Features

- **Digital Study design** — warm editorial palette with Cormorant Garamond + Inter, light ("日光书房") and dark ("灯下夜读") themes
- **Blog** — 50+ posts with tag filtering, reading time, table of contents, and Shiki dual-theme syntax highlighting
- **Projects** — curated showcase of personal and course work
- **Labs** — space for experiments, prototypes, and small demos
- **Friends** — blogroll / link exchange page

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Astro 6 (Content Layer API, View Transitions) |
| Styling | Tailwind CSS v4 + custom design tokens |
| Typography | Cormorant Garamond, Inter, JetBrains Mono |
| Icons | astro-icon + Iconify (Simple Icons, Lucide) |
| Syntax | Shiki (github-light / github-dark) |
| Media | Cloudflare R2 CDN |

## Development

```bash
npm install
npm run dev        # http://localhost:4322
npm run build      # production build
npm run preview    # preview production build
```

## Project Structure

```
src/
├── content/blog/   # Markdown blog posts
├── layouts/        # PageLayout wrapper
├── components/     # Header, Footer, ThemeToggle
├── pages/
│   ├── index.astro       # Homepage
│   ├── blog/             # Blog list + [slug] detail
│   ├── projects/         # Project showcase
│   ├── labs/             # Experiments
│   ├── friends.astro     # Blogroll
│   └── about.astro       # About + social links
├── lib/            # Blog utilities
└── styles/         # Global CSS + design tokens
```

## License

[MIT](LICENSE)
