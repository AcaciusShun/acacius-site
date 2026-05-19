import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { siteConfig } from "@/lib/config";
import { getPublishedPosts, postSlug } from "@/lib/blog";

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/blog/${postSlug(post)}/`,
    })),
  });
}
