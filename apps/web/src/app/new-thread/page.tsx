"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { TagWithCount } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { MarkdownEditor } from "../markdown";

function NewThreadForm() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTagSlug = searchParams.get("tag");

  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ tags: TagWithCount[] }>("/api/tags").then((res) => {
      setTags(res.tags);
      if (preselectedTagSlug) {
        const match = res.tags.find((t) => t.slug === preselectedTagSlug);
        if (match) setSelectedTagIds([match.id]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedTagSlug]);

  if (loading) return <p className="meta">Loading...</p>;
  if (!user) return <p className="meta">Log in first.</p>;
  if (user.verificationStatus !== "VERIFIED") {
    return (
      <p className="notice">
        You need to <a href="/verify">verify your identity</a> before starting a thread.
      </p>
    );
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { thread } = await api.post<{ thread: { id: string } }>(
        "/api/threads",
        { title, body, tagIds: selectedTagIds },
        token,
      );
      router.push(`/t/${thread.id}`);
    } catch (err: any) {
      setError(err.message ?? "Could not create thread");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to the feed
      </Link>
      <h1 className="page-title">New Thread</h1>
      <p className="meta" style={{ marginBottom: "1.5rem" }}>
        Pose the question well and the discussion will follow.
      </p>
      <form onSubmit={onSubmit} style={{ maxWidth: "none" }}>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Frame it as a question worth arguing about"
            required
          />
        </label>
        <label>
          Opening post
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="State your position, or lay out the question..."
            minHeight="200px"
            required
          />
        </label>
        <label>
          Tags <span className="meta" style={{ fontWeight: 400 }}>(optional)</span>
          <div className="tag-row" style={{ marginBottom: 0 }}>
            {tags?.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`tag-chip ${selectedTagIds.includes(t.id) ? "tag-chip-active" : ""}`}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Posting..." : "Post thread"}
        </button>
      </form>
    </div>
  );
}

// useSearchParams() forces client-side rendering, which `next build` rejects
// during static prerender unless it sits inside a Suspense boundary.
export default function NewThreadPage() {
  return (
    <Suspense fallback={<p className="meta">Loading...</p>}>
      <NewThreadForm />
    </Suspense>
  );
}
