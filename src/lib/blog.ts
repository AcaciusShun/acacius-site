import { getCollection } from "astro:content";

export async function getPublishedPosts() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
}

export function getAllTags(
  posts: Awaited<ReturnType<typeof getPublishedPosts>>
) {
  const map = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      map.set(tag, (map.get(tag) || 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

export function readingTime(content: string): string {
  const CJK = /[一-鿿㐀-䶿]/g;
  const cjkCount = (content.match(CJK) || []).length;
  const stripped = content.replace(CJK, " ");
  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil((cjkCount / 300 + wordCount / 200));
  return `${Math.max(1, minutes)} min`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function postSlug(post: { id: string; data: { slug?: string } }) {
  return post.data.slug || post.id;
}
