import type { Post } from "./types";

export interface PostWithDepth extends Post {
  depth: number;
}

/**
 * Turns a flat, createdAt-ordered post list into a depth-first ordering where
 * each reply immediately follows its parent (and its own replies immediately
 * follow it) — the standard "threaded comments" layout. `depth` is how many
 * ancestors a post has, for indentation.
 */
export function flattenPostTree(posts: Post[]): PostWithDepth[] {
  const childrenByParentId = new Map<string | null, Post[]>();
  for (const post of posts) {
    const key = post.parentId;
    const siblings = childrenByParentId.get(key);
    if (siblings) siblings.push(post);
    else childrenByParentId.set(key, [post]);
  }

  const ordered: PostWithDepth[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const post of childrenByParentId.get(parentId) ?? []) {
      ordered.push({ ...post, depth });
      visit(post.id, depth + 1);
    }
  }
  visit(null, 0);

  return ordered;
}
