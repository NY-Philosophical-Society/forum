import { Router } from "../router";
import { SEARCH_MIN_QUERY_LENGTH, type SearchResultType } from "@nyps-forum/shared";
import { requireAuth } from "../guards";
import { searchPosts, searchThreads, searchUsers } from "../search";

export const searchRouter = Router();

const DEFAULT_LIMIT = 10;
const EMPTY = { items: [], total: 0, hasMore: false };

/**
 * requireAuth, deliberately: full thread bodies and replies are readable
 * only with an account (the anonymous web preview truncates them), and
 * search snippets would leak exactly that content to anonymous visitors.
 */
searchRouter.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < SEARCH_MIN_QUERY_LENGTH) {
    return res
      .status(400)
      .json({ error: `Search needs at least ${SEARCH_MIN_QUERY_LENGTH} characters` });
  }
  const rawType = String(req.query.type ?? "all");
  const type: SearchResultType = ["threads", "posts", "users"].includes(rawType)
    ? (rawType as SearchResultType)
    : "all";
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const opts = { limit, offset };

  const [threads, posts, users] = await Promise.all([
    type === "all" || type === "threads" ? searchThreads(q, opts) : EMPTY,
    type === "all" || type === "posts" ? searchPosts(q, opts) : EMPTY,
    type === "all" || type === "users" ? searchUsers(q, opts) : EMPTY,
  ]);

  res.json({ q, threads, posts, users, limit, offset });
});
