"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { TagWithCount } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function NewThreadPage() {
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

  if (loading) return <p>Loading...</p>;
  if (!user) return <p>Log in first.</p>;
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
      <h1>New Thread</h1>
      <form onSubmit={onSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Opening post
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
        </label>
        <label>
          Tags (optional)
          <div className="tag-row">
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
