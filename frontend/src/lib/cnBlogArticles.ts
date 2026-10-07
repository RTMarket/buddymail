import { CN_BLOG_ARTICLES, type CnBlogArticle } from "./cnBlogArticles.generated";

export type { CnBlogArticle };

export function listCnBlogArticles(): CnBlogArticle[] {
  return CN_BLOG_ARTICLES;
}

export function getCnBlogArticle(slug: string): CnBlogArticle | undefined {
  return CN_BLOG_ARTICLES.find((a) => a.slug === slug);
}

export const CN_BLOG_ORIGIN = (import.meta.env.VITE_PUBLIC_SITE_ORIGIN || "").replace(/\/$/, "");
