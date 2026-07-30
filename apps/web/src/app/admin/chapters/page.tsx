"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ChapterMemberItem,
  ChapterMembersResponse,
  ChapterSummary,
  PublicUser,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { Avatar, ConfirmAction, Skeleton } from "../../ui";

/**
 * Chapter administration: create chapters, review join requests, add and
 * remove members. Dense internal tooling like the rest of /admin — removals
 * go through ConfirmAction so the moderation log gets its reason.
 */
export default function AdminChaptersPage() {
  const { token } = useAuth();
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    api
      .get<{ chapters: ChapterSummary[] }>("/api/chapters", token)
      .then((res) => setChapters(res.chapters))
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  return (
    <div>
      <CreateChapterForm onCreated={refresh} />

      {error && <p className="error">{error}</p>}
      {!chapters && !error && <Skeleton style={{ height: "4rem", width: "100%" }} />}

      {chapters?.length === 0 && <p className="meta">No chapters yet — create the first above.</p>}

      {chapters?.map((c) => (
        <div className="card admin-chapter" key={c.id}>
          <div className="row between wrap">
            <div>
              <Link className="title" href={`/c/${c.slug}`}>
                {c.name}
              </Link>
              <p className="meta" style={{ marginTop: "0.25rem" }}>
                /c/{c.slug}
                {c.location ? ` · ${c.location}` : ""} · {c.memberCount}{" "}
                {c.memberCount === 1 ? "member" : "members"}
                {c.pendingCount ? (
                  <strong> · {c.pendingCount} pending</strong>
                ) : null}
              </p>
            </div>
            <button
              className="secondary btn-sm"
              onClick={() => setOpenSlug(openSlug === c.slug ? null : c.slug)}
            >
              {openSlug === c.slug ? "Close" : "Members"}
            </button>
          </div>
          {openSlug === c.slug && <ChapterMembers slug={c.slug} onChanged={refresh} />}
        </div>
      ))}
    </div>
  );
}

function CreateChapterForm({ onCreated }: { onCreated: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        "/api/chapters",
        { name, description, ...(location.trim() ? { location } : {}) },
        token,
      );
      setName("");
      setDescription("");
      setLocation("");
      setOpen(false);
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Could not create the chapter");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: "1.25rem" }}>
        <button className="btn-sm" onClick={() => setOpen(true)}>
          New chapter
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: "1.25rem", maxWidth: "none" }}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New York City" required />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this chapter is, in a sentence or two"
          maxLength={300}
          required
          style={{ minHeight: "70px" }}
        />
      </label>
      <label>
        Location <span className="field-hint">Optional</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="New York, NY" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create chapter"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ChapterMembers({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<ChapterMembersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    api
      .get<ChapterMembersResponse>(`/api/chapters/${slug}/members`, token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token, slug]);

  useEffect(refresh, [refresh]);

  async function approve(userId: string) {
    if (!token) return;
    setBusyUserId(userId);
    try {
      await api.post(`/api/chapters/${slug}/members/${userId}/approve`, {}, token);
      refresh();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyUserId(null);
    }
  }

  async function remove(userId: string) {
    if (!token) return;
    setBusyUserId(userId);
    try {
      await api.delete(`/api/chapters/${slug}/members/${userId}`, token);
      refresh();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyUserId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <Skeleton style={{ height: "2rem", width: "100%", marginTop: "1rem" }} />;

  const MemberRow = ({ m, pending }: { m: ChapterMemberItem; pending: boolean }) => (
    <div className="row between wrap admin-chapter-row" key={m.user.id}>
      <Link className="author-link" href={`/u/${m.user.id}`}>
        <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={24} />
        <span>{m.user.displayName}</span>
      </Link>
      <div className="row">
        {pending ? (
          <>
            <button
              className="btn-sm"
              disabled={busyUserId === m.user.id}
              onClick={() => approve(m.user.id)}
            >
              Approve
            </button>
            <button
              className="secondary btn-sm"
              disabled={busyUserId === m.user.id}
              onClick={() => remove(m.user.id)}
            >
              Reject
            </button>
          </>
        ) : (
          <ConfirmAction
            label="Remove"
            title={`Remove ${m.user.displayName} from this chapter`}
            description="They lose access to the chapter's threads immediately. Their notifications about them are cleared."
            confirmLabel="Remove member"
            danger
            reasonRequired={false}
            reasonLabel="Note (recorded in the moderation log)"
            onConfirm={async () => {
              await api.delete(`/api/chapters/${slug}/members/${m.user.id}`, token);
              refresh();
              onChanged();
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: "1rem" }}>
      {data.pending && data.pending.length > 0 && (
        <>
          <p className="admin-section-label">Join requests</p>
          {data.pending.map((m) => (
            <MemberRow m={m} pending key={m.user.id} />
          ))}
        </>
      )}

      <p className="admin-section-label">Members</p>
      {data.members.length === 0 && <p className="meta">No members yet.</p>}
      {data.members.map((m) => (
        <MemberRow m={m} pending={false} key={m.user.id} />
      ))}

      <AddMember slug={slug} onAdded={() => (refresh(), onChanged())} />
    </div>
  );
}

/** Find a user by name and add them directly (lands active, no request step). */
function AddMember({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !query.trim()) return;
    setError(null);
    try {
      const res = await api.get<{ users: PublicUser[] }>(
        `/api/users?search=${encodeURIComponent(query.trim())}`,
        token,
      );
      setResults(res.users);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function add(userId: string) {
    if (!token) return;
    setBusy(true);
    try {
      await api.post(`/api/chapters/${slug}/members`, { userId }, token);
      setResults(null);
      setQuery("");
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <form className="row" onSubmit={search}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a member by name..."
        />
        <button className="secondary btn-sm" type="submit">
          Find
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {results && results.length === 0 && <p className="meta">No one by that name.</p>}
      {results?.map((u) => (
        <div className="row between wrap admin-chapter-row" key={u.id}>
          <span className="row">
            <Avatar name={u.displayName} src={u.avatarUrl} size={24} />
            <span>{u.displayName}</span>
            {!u.isSupporter && <span className="meta">not a Society member</span>}
          </span>
          <button className="btn-sm" disabled={busy} onClick={() => add(u.id)}>
            Add
          </button>
        </div>
      ))}
    </div>
  );
}
