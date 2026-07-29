"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate, type TagWithCount, type ThreadSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";

export default function HomePage() {
  const { user, token } = useAuth();
  const { dateFormat } = useSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") === "new" ? "new" : "hot";
  const activeTag = searchParams.get("tag") ?? "";

  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);

  const VISIBLE_TAG_COUNT = 6;

  useEffect(() => {
    api
      .get<{ tags: TagWithCount[] }>("/api/tags")
      .then((res) => setTags(res.tags))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ sort });
    if (activeTag) qs.set("tag", activeTag);
    api
      .get<{ threads: ThreadSummary[] }>(`/api/threads?${qs.toString()}`, token)
      .then((res) => setThreads(res.threads))
      .catch((e) => setError(e.message));
  }, [sort, activeTag, token]);

  function setSort(next: "hot" | "new") {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("sort", next);
    router.push(`/?${qs.toString()}`);
  }

  function setTag(slug: string) {
    const qs = new URLSearchParams(searchParams.toString());
    if (slug) qs.set("tag", slug);
    else qs.delete("tag");
    router.push(`/?${qs.toString()}`);
  }

  async function toggleLike(threadId: string) {
    if (!token) return;
    await api.post(`/api/threads/${threadId}/like`, {}, token);
    const qs = new URLSearchParams({ sort });
    if (activeTag) qs.set("tag", activeTag);
    const res = await api.get<{ threads: ThreadSummary[] }>(`/api/threads?${qs.toString()}`, token);
    setThreads(res.threads);
  }

  return (
    <div>
      <h1>Discussion Feed</h1>
      <p className="meta">
        A real-name, ID-verified space for philosophical discussion. Anyone can read; posting,
        liking, and replying requires identity verification.
      </p>

      <div className="tab-row">
        <button className={sort === "hot" ? "" : "secondary"} onClick={() => setSort("hot")}>
          Hot
        </button>
        <button className={sort === "new" ? "" : "secondary"} onClick={() => setSort("new")}>
          New
        </button>
        {user?.verificationStatus === "VERIFIED" && (
          <Link href={activeTag ? `/new-thread?tag=${activeTag}` : "/new-thread"} style={{ marginLeft: "auto" }}>
            <button>Start a thread</button>
          </Link>
        )}
      </div>

      <div className="tag-row">
        <button
          className={`tag-chip ${activeTag === "" ? "tag-chip-active" : ""}`}
          onClick={() => setTag("")}
        >
          All
        </button>
        {(showAllTags ? tags : tags?.slice(0, VISIBLE_TAG_COUNT))?.map((t) => (
          <button
            key={t.id}
            className={`tag-chip ${activeTag === t.slug ? "tag-chip-active" : ""}`}
            onClick={() => setTag(t.slug)}
            title={t.description}
          >
            {t.name} ({t.threadCount})
          </button>
        ))}
        {tags && tags.length > VISIBLE_TAG_COUNT && (
          <button className="tag-chip" onClick={() => setShowAllTags((v) => !v)}>
            {showAllTags ? "Show less" : `Show more (+${tags.length - VISIBLE_TAG_COUNT})`}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!threads && !error && <p>Loading...</p>}
      {threads?.length === 0 && <p className="meta">No threads yet — be the first.</p>}

      {threads?.map((t) => (
        <div className="card" key={t.id}>
          <Link className="title" href={`/t/${t.id}`}>
            {t.title}
          </Link>
          <p className="meta">
            by {t.author.displayName} · {formatDate(t.createdAt, dateFormat)}
          </p>
          {t.tags.length > 0 && (
            <div className="tag-row" style={{ marginTop: "0.4rem" }}>
              {t.tags.map((tag) => (
                <span className="tag-chip" key={tag.id}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <div className="like-row">
            <button
              className={`like-button ${t.myLiked ? "like-button-active" : ""}`}
              disabled={user?.verificationStatus !== "VERIFIED"}
              onClick={() => toggleLike(t.id)}
            >
              ♥ {t.likeCount}
            </button>
            <span className="meta">{t.postCount} replies</span>
          </div>
        </div>
      ))}
    </div>
  );
}
