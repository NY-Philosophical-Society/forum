"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BIO_MAX_LENGTH, type PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { prepareAvatar } from "~/lib/avatar-image";
import { useAuth } from "~/lib/auth-context";
import { Avatar } from "../../ui";

export default function EditProfilePage() {
  const { user, token, loading, refreshUser } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the form once the session is known; don't clobber edits on refreshUser.
  //
  // The account stores one `displayName`, so the two fields are a presentation
  // split: everything up to the first space is the first name, the remainder
  // is the last name. That keeps multi-part surnames ("van der Berg") intact,
  // which the naive "split on every space" version would mangle.
  useEffect(() => {
    if (user && !seeded) {
      setBio(user.bio ?? "");
      const [first = "", ...rest] = user.displayName.trim().split(/\s+/);
      setFirstName(first);
      setLastName(rest.join(" "));
      setSeeded(true);
    }
  }, [user, seeded]);

  if (loading) return null;
  if (!user) {
    return (
      <p className="meta">
        You need to <a href="/login">log in</a> to edit your profile.
      </p>
    );
  }

  const nameLocked = user.verificationStatus === "VERIFIED";

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await prepareAvatar(file);
      await api.upload<{ user: PublicUser }>("/api/users/me/avatar", blob, token);
      await refreshUser();
    } catch (err: any) {
      setError(err.message ?? "Could not upload that photo");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!token) return;
    setError(null);
    setUploading(true);
    try {
      await api.delete("/api/users/me/avatar", token);
      await refreshUser();
    } catch (err: any) {
      setError(err.message ?? "Could not remove the photo");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await api.patch<{ user: PublicUser }>(
        "/api/users/me",
        nameLocked ? { bio } : { bio, displayName },
        token,
      );
      await refreshUser();
      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link href={`/u/${user.id}`} className="back-link">
        ← Back to your profile
      </Link>
      <h1 className="page-title">Edit profile</h1>

      <div className="card settings-section" style={{ marginTop: "1.5rem" }}>
        <h3>Photo</h3>
        <p className="meta">
          The forum was founded on real names and real faces — members post under both.
        </p>
        <div className="avatar-edit-row">
          <Avatar name={user.displayName} src={user.avatarUrl} size={84} />
          <div className="avatar-edit-actions">
            <button
              type="button"
              className="secondary btn-sm"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Working..." : user.avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {user.avatarUrl && (
              <button type="button" className="link-button" onClick={removePhoto} disabled={uploading}>
                Remove photo
              </button>
            )}
            <p className="field-hint">JPEG, PNG, or WebP. Cropped square, at least 100×100px.</p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={pickPhoto}
        />
      </div>

      <form onSubmit={save}>
        <div className="card settings-section" style={{ maxWidth: "none" }}>
          <h3>About you</h3>
          <div className="field-pair">
            <label>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={nameLocked}
                placeholder="Jane"
                required
                maxLength={40}
              />
            </label>
            <label>
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={nameLocked}
                placeholder="Doe"
                required
                maxLength={40}
              />
            </label>
          </div>
          {nameLocked ? (
            <p className="field-hint">
              This is the legal name your identity was verified against, so it can&apos;t be
              changed while verified. Contact the Society if your legal name has changed.
            </p>
          ) : (
            <p className="field-hint">
              Your real name — it becomes permanent once your identity is verified.
            </p>
          )}
          <label>
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX_LENGTH}
              placeholder="A line or two about you and what you like to argue about."
              style={{ minHeight: "100px" }}
            />
            <p className="field-hint">
              {bio.length}/{BIO_MAX_LENGTH} characters. Markdown works here — **bold**, *italic*,
              links.
            </p>
          </label>
          {error && <p className="error">{error}</p>}
          {saved && <p className="toast" style={{ marginBottom: 0 }}>Profile saved.</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
