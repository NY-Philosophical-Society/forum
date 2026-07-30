"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DirectoryEntry, DirectoryResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { MembershipPitch } from "../membership-pitch";
import { Avatar, EmptyState, Skeleton } from "../ui";

const PAGE_SIZE = 30;

/**
 * The member directory: opt-in, member-only. Searchable by name and
 * interest; the "open to partners" filter is the whole reading-partner
 * matching feature — members find each other here and take it to DMs.
 */
export default function DirectoryPage() {
  const { user, token, loading } = useAuth();
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [partnersOnly, setPartnersOnly] = useState(false);

  function buildPath(offset: number) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (query) qs.set("q", query);
    if (partnersOnly) qs.set("partners", "1");
    return `/api/directory?${qs.toString()}`;
  }

  useEffect(() => {
    if (!token || !isMemberViewer) return;
    setEntries(null);
    api
      .get<DirectoryResponse>(buildPath(0), token)
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isMemberViewer, query, partnersOnly]);

  if (loading) return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  if (!isMemberViewer) return <MembershipPitch />;

  async function loadMore() {
    if (!token || !entries) return;
    setLoadingMore(true);
    try {
      const res = await api.get<DirectoryResponse>(buildPath(entries.length), token);
      setEntries([...entries, ...res.entries]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const inDirectory = user ? entries?.some((e) => e.user.id === user.id) : false;

  return (
    <div>
      <h1 className="page-title">Member directory</h1>
      <p className="meta" style={{ marginBottom: "1.25rem" }}>
        Members who chose to be findable — by name, chapter, and what they&apos;re reading.
        Everyone here opted in, and so can you, from{" "}
        <Link href="/settings" className="inline-link">
          Settings
        </Link>
        .
      </p>

      <form
        className="row wrap"
        style={{ marginBottom: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(queryInput.trim());
        }}
      >
        <input
          type="search"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search by name or interest..."
          style={{ flex: 1, minWidth: "14rem" }}
        />
        <button className="secondary btn-sm" type="submit">
          Search
        </button>
        <button
          type="button"
          className={`tag-chip ${partnersOnly ? "tag-chip-active" : ""}`}
          onClick={() => setPartnersOnly((v) => !v)}
        >
          ⇄ Open to reading partners
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!entries && !error && (
        <>
          <Skeleton style={{ height: "4.5rem", width: "100%", marginBottom: "1rem" }} />
          <Skeleton style={{ height: "4.5rem", width: "100%" }} />
        </>
      )}

      {entries && entries.length === 0 && (
        <EmptyState
          title={
            partnersOnly
              ? "No one is flying the reading-partner flag yet"
              : query
                ? "No members match"
                : "The directory is empty so far"
          }
          hint={
            partnersOnly
              ? "Be the first — switch it on in Settings and someone will find you."
              : "Members appear here once they opt in from Settings."
          }
        />
      )}

      {entries?.map((entry) => (
        <article className="card dir-card" key={entry.user.id}>
          <Link href={`/u/${entry.user.id}`} className="dir-avatar" aria-hidden tabIndex={-1}>
            <Avatar name={entry.user.displayName} src={entry.user.avatarUrl} size={52} />
          </Link>
          <div className="dir-body">
            <div className="row wrap" style={{ gap: "0.5rem" }}>
              <Link href={`/u/${entry.user.id}`} className="dir-name">
                {entry.user.displayName}
              </Link>
              {entry.openToPartners && (
                <span className="badge badge-partner">⇄ open to partners</span>
              )}
            </div>
            {entry.chapters.length > 0 && (
              <p className="meta" style={{ margin: "0.2rem 0 0" }}>
                {entry.chapters.map((c) => c.name).join(" · ")}
              </p>
            )}
            {entry.directoryBio && <p className="dir-bio">{entry.directoryBio}</p>}
          </div>
          {user && entry.user.id !== user.id && (
            <Link href={`/messages/${entry.user.id}`} className="dir-action">
              <button className="secondary btn-sm">Message</button>
            </Link>
          )}
        </article>
      ))}

      {entries && entries.length > 0 && (
        <p className="meta" style={{ marginTop: "0.75rem" }}>
          {total} {total === 1 ? "member" : "members"}
          {partnersOnly ? " open to partners" : " in the directory"}
          {!inDirectory && " — you're not listed yet"}
        </p>
      )}

      {hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
