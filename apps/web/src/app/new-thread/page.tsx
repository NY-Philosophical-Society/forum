"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ChapterSummary, TagWithCount } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { MarkdownEditor } from "../markdown";

function NewThreadForm() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTagSlug = searchParams.get("tag");
  const chapterSlug = searchParams.get("chapter");

  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [chapter, setChapter] = useState<ChapterSummary | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Admin-only event creation: one thread per club event, with its date and
  // an optional attendance code to read out in the room.
  const [isEvent, setIsEvent] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventCode, setEventCode] = useState("");

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

  useEffect(() => {
    if (!chapterSlug || !token) return;
    api
      .get<{ chapter: ChapterSummary }>(`/api/chapters/${chapterSlug}`, token)
      .then((res) => setChapter(res.chapter))
      .catch((e) => setError(e.message));
  }, [chapterSlug, token]);

  if (loading) return <p className="meta">Loading...</p>;
  if (!user) {
    // A bare "Log in first." is a dead end — give them the way out.
    return (
      <div>
        <h1 className="page-title">Start a thread</h1>
        <p className="meta" style={{ marginTop: "1rem" }}>
          <a href="/login">Log in</a> or <a href="/signup">create an account</a> to post.
        </p>
      </div>
    );
  }
  if (!user.canWrite) {
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
        {
          title,
          body,
          tagIds: selectedTagIds,
          ...(chapter ? { chapterId: chapter.id } : {}),
          ...(isEvent
            ? {
                kind: "event",
                eventDate: new Date(eventDate).toISOString(),
                ...(eventCode.trim() ? { eventCode: eventCode.trim() } : {}),
              }
            : {}),
        },
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
      <Link href={chapter ? `/c/${chapter.slug}` : "/"} className="back-link">
        ← Back to {chapter ? chapter.name : "the feed"}
      </Link>
      <h1 className="page-title">New Thread</h1>
      <p className="meta" style={{ marginBottom: "1.5rem" }}>
        {chapter
          ? `Posting in the ${chapter.name} chapter — visible to its members only.`
          : "Pose the question well and the discussion will follow."}
      </p>
      <form onSubmit={onSubmit} style={{ maxWidth: "none" }}>
        {user.role === "admin" && (
          <div className="card" style={{ marginBottom: "1rem" }}>
            <label className="pref-row" style={{ borderTop: "none", paddingTop: 0 }}>
              <span>
                <span className="pref-label">This is an event thread</span>
                <span className="meta">
                  One per club event: collects questions before the date, carries the topics,
                  recording, and transcript after. Anyone may read it; posting is member-only.
                </span>
              </span>
              <input type="checkbox" checked={isEvent} onChange={(e) => setIsEvent(e.target.checked)} />
            </label>
            {isEvent && (
              <>
                <label>
                  Event date and time
                  <input
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Attendance code <span className="field-hint">Optional</span>
                  <input
                    value={eventCode}
                    onChange={(e) => setEventCode(e.target.value)}
                    placeholder="Read out in the room — attendees redeem it for a 'was there' mark"
                    minLength={4}
                    maxLength={40}
                  />
                </label>
              </>
            )}
          </div>
        )}
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Frame it as a question worth discussing"
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
