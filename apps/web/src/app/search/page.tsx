"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  formatDate,
  SEARCH_MIN_QUERY_LENGTH,
  type PublicUser,
  type SearchResponse,
  type SearchResultType,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar, EmptyState, PostSkeleton } from "../ui";

const PAGE_SIZE = 10;

/** Wraps every case-insensitive occurrence of `term` in <mark>. */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const at = lower.indexOf(t, i);
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    parts.push(text.slice(i, at));
    parts.push(<mark key={at}>{text.slice(at, at + term.length)}</mark>);
    i = at + term.length;
  }
  return <>{parts}</>;
}

const TABS: { value: SearchResultType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "threads", label: "Threads" },
  { value: "posts", label: "Replies" },
  { value: "users", label: "Members" },
];

function SearchContent() {
  const { user, token, loading: authLoading } = useAuth();
  const { dateFormat } = useSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const rawType = searchParams.get("type") ?? "all";
  const type: SearchResultType = ["threads", "posts", "users"].includes(rawType)
    ? (rawType as SearchResultType)
    : "all";

  const [input, setInput] = useState(q);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInput(q);
    if (!token || q.trim().length < SEARCH_MIN_QUERY_LENGTH) {
      setResult(null);
      return;
    }
    setSearching(true);
    setError(null);
    api
      .get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=${PAGE_SIZE}&offset=0`,
        token,
      )
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false));
  }, [q, type, token]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    qs.set("q", input.trim());
    if (type !== "all") qs.set("type", type);
    router.push(`/search?${qs.toString()}`);
  }

  function setTab(next: SearchResultType) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (next !== "all") qs.set("type", next);
    router.push(`/search?${qs.toString()}`);
  }

  async function loadMore() {
    if (!token || !result || type === "all") return;
    setLoadingMore(true);
    try {
      const offset = result[type].items.length;
      const res = await api.get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=${PAGE_SIZE}&offset=${offset}`,
        token,
      );
      setResult({
        ...result,
        [type]: {
          ...res[type],
          items: [...(result[type].items as any[]), ...(res[type].items as any[])],
        },
      });
    } finally {
      setLoadingMore(false);
    }
  }

  if (!authLoading && !user) {
    return (
      <EmptyState
        title="Search is for members"
        hint="Sign in to search threads, replies, and members."
        action={
          <Link href="/login">
            <button>Log in</button>
          </Link>
        }
      />
    );
  }

  const nothingFound =
    result &&
    result.threads.items.length === 0 &&
    result.posts.items.length === 0 &&
    result.users.items.length === 0;

  return (
    <div>
      <h1 className="page-title">Search</h1>

      <form className="search-bar" onSubmit={submit}>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Threads, replies, members..."
          aria-label="Search"
          autoFocus
        />
        <button type="submit" disabled={input.trim().length < SEARCH_MIN_QUERY_LENGTH}>
          Search
        </button>
      </form>

      <div className="segmented" style={{ marginBottom: "1.25rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            className={type === tab.value ? "segmented-active" : ""}
            onClick={() => setTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {searching && (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}

      {!searching && !result && !error && (
        <EmptyState
          title="Search the forum"
          hint="Find threads, replies, and members by keyword or name."
        />
      )}

      {!searching && nothingFound && (
        <EmptyState
          title={`Nothing found for “${q}”`}
          hint="Try a shorter word, or a different spelling."
        />
      )}

      {!searching && result && (
        <>
          {result.threads.items.length > 0 && (
            <section>
              {type === "all" && <h3 className="search-section-title">Threads</h3>}
              {result.threads.items.map((t) => (
                <Link className="card search-hit" href={`/t/${t.id}`} key={t.id}>
                  <span className="search-hit-kind">Thread</span>
                  <span className="title">
                    <Highlight text={t.title} term={q} />
                  </span>
                  <span className="search-snippet">
                    <Highlight text={t.snippet} term={q} />
                  </span>
                  <span className="meta">
                    {t.author.displayName} · {formatDate(t.createdAt, dateFormat)} · ♥ {t.likeCount}{" "}
                    · {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
                  </span>
                </Link>
              ))}
              {type === "all" && result.threads.hasMore && (
                <button className="link-button" onClick={() => setTab("threads")}>
                  See all {result.threads.total} threads →
                </button>
              )}
            </section>
          )}

          {result.posts.items.length > 0 && (
            <section>
              {type === "all" && <h3 className="search-section-title">Replies</h3>}
              {result.posts.items.map((p) => (
                <Link
                  className="card search-hit"
                  href={`/t/${p.threadId}#post-${p.id}`}
                  key={p.id}
                >
                  <span className="search-hit-kind">Reply · in “{p.threadTitle}”</span>
                  <span className="search-snippet">
                    <Highlight text={p.snippet} term={q} />
                  </span>
                  <span className="meta">
                    {p.author.displayName} · {formatDate(p.createdAt, dateFormat)}
                  </span>
                </Link>
              ))}
              {type === "all" && result.posts.hasMore && (
                <button className="link-button" onClick={() => setTab("posts")}>
                  See all {result.posts.total} replies →
                </button>
              )}
            </section>
          )}

          {result.users.items.length > 0 && (
            <section>
              {type === "all" && <h3 className="search-section-title">Members</h3>}
              {result.users.items.map((u: PublicUser) => (
                <Link className="card search-hit search-hit-user" href={`/u/${u.id}`} key={u.id}>
                  <Avatar name={u.displayName} src={u.avatarUrl} size={34} />
                  <span>
                    <span className="title">
                      <Highlight text={u.displayName} term={q} />
                    </span>
                    <span className="meta" style={{ display: "block" }}>
                      Member since {formatDate(u.createdAt, dateFormat)}
                    </span>
                  </span>
                </Link>
              ))}
              {type === "all" && result.users.hasMore && (
                <button className="link-button" onClick={() => setTab("users")}>
                  See all {result.users.total} members →
                </button>
              )}
            </section>
          )}

          {type !== "all" && result[type].hasMore && (
            <button className="load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// useSearchParams() forces client-side rendering, which `next build` rejects
// during static prerender unless it sits inside a Suspense boundary.
export default function SearchPage() {
  return (
    <Suspense fallback={<PostSkeleton />}>
      <SearchContent />
    </Suspense>
  );
}
