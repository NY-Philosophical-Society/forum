import { stripMarkdown, type PostSearchResult, type PublicUser, type SearchSection, type ThreadSearchResult } from "@nyps-forum/shared";
import { containsInsensitive, prisma } from "./db";
import { toPublicUser } from "./serialize";

/**
 * Every forum search query lives in this module — routes/search.ts only
 * parses parameters and assembles the response, so access rules and engine
 * changes both land in exactly one place.
 *
 * Engine: substring match (Prisma `contains` → SQL LIKE). SQLite's LIKE is
 * case-insensitive for ASCII, which is fine for a dev prototype but won't
 * rank by relevance and table-scans at scale. Upgrade path, in order of
 * effort: SQLite FTS5 virtual tables locally / Postgres full-text
 * (`tsvector` column + GIN index, `websearch_to_tsquery`) in production.
 * Swap the bodies of the three search functions; their signatures and the
 * result shapes are engine-agnostic and nothing outside this file changes.
 *
 * Access rules: callers must be authenticated (any account reads all content
 * in full under the current model — routes/search.ts enforces it). When
 * brief 04 lands supporter-gated reading and chapters, its filters belong in
 * the `where` clauses below — search is a classic place gated content leaks
 * out through snippets.
 */

const SNIPPET_RADIUS = 70;

/** Plain-text window around the first match, ellipsized on both sides. */
export function buildSnippet(body: string, term: string): string {
  const text = stripMarkdown(body).replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return text.length > SNIPPET_RADIUS * 2 ? `${text.slice(0, SNIPPET_RADIUS * 2)}…` : text;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + term.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export async function searchThreads(
  q: string,
  opts: { limit: number; offset: number },
): Promise<SearchSection<ThreadSearchResult>> {
  // Chapter threads are excluded from search outright — for everyone, members
  // of the chapter included. Search covers the shared forum; a chapter's own
  // feed is the only listing of its content. Snippets are exactly how gated
  // content would otherwise leak.
  const where = {
    deletedAt: null,
    chapterId: null,
    OR: [{ title: containsInsensitive(q) }, { body: containsInsensitive(q) }],
  };
  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.offset,
      take: opts.limit,
      include: {
        author: true,
        _count: { select: { posts: { where: { deletedAt: null } }, likes: true } },
      },
    }),
    prisma.thread.count({ where }),
  ]);
  return {
    items: threads.map((t) => ({
      id: t.id,
      title: t.title,
      snippet: buildSnippet(t.body, q),
      author: toPublicUser(t.author),
      createdAt: t.createdAt.toISOString(),
      likeCount: t._count.likes,
      postCount: t._count.posts,
    })),
    total,
    hasMore: opts.offset + threads.length < total,
  };
}

export async function searchPosts(
  q: string,
  opts: { limit: number; offset: number },
): Promise<SearchSection<PostSearchResult>> {
  // Same chapter exclusion as searchThreads — replies leak content just as well.
  const where = { deletedAt: null, body: containsInsensitive(q), thread: { chapterId: null } };
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.offset,
      take: opts.limit,
      include: { author: true, thread: { select: { title: true, deletedAt: true } } },
    }),
    prisma.post.count({ where }),
  ]);
  return {
    items: posts.map((p) => ({
      id: p.id,
      threadId: p.threadId,
      threadTitle: p.thread.deletedAt ? "[deleted]" : p.thread.title,
      snippet: buildSnippet(p.body, q),
      author: toPublicUser(p.author),
      createdAt: p.createdAt.toISOString(),
    })),
    total,
    hasMore: opts.offset + posts.length < total,
  };
}

export async function searchUsers(
  q: string,
  opts: { limit: number; offset: number },
): Promise<SearchSection<PublicUser>> {
  const where = { deletedAt: null, displayName: containsInsensitive(q) };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: opts.offset,
      take: opts.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: users.map(toPublicUser),
    total,
    hasMore: opts.offset + users.length < total,
  };
}
