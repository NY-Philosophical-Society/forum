"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";

/**
 * The single membership page a non-member meets wherever a member space
 * begins — chapters, the directory. Deliberately a pitch, not an error page:
 * reading the forum stays free forever; membership buys the rooms where
 * members find each other.
 */
export function MembershipPitch() {
  const { user } = useAuth();

  return (
    <div className="pitch">
      <span className="eyebrow">Membership</span>
      <h1 className="pitch-title">The rooms where members find each other</h1>
      <p className="pitch-dek">
        The forum is free — reading, writing, arguing, all of it, forever. Membership sustains
        the Society&apos;s events and journal, and opens the spaces built around the people in the
        room.
      </p>

      <div className="pitch-tick" aria-hidden />

      <ul className="perk-list">
        <li>
          <span className="perk-name">Chapters</span>
          <span className="perk-desc">
            Private local sub-forums — the NYC chapter plans its meetups, argues its reading list,
            and talks among itself.
          </span>
        </li>
        <li>
          <span className="perk-name">The member directory</span>
          <span className="perk-desc">
            Opt-in and members-only: photo, name, chapter, interests. The scarce good is finding
            the other serious people.
          </span>
        </li>
        <li>
          <span className="perk-name">Reading partners</span>
          <span className="perk-desc">
            Flag yourself open to a reading partner or study group, filter the directory for
            others who did, and take it from there by DM.
          </span>
        </li>
        <li>
          <span className="perk-name">The conversation after every event</span>
          <span className="perk-desc">
            Event threads collect questions before the evening and carry the topics, recording,
            and transcript after. Anyone may read; members carry the conversation on with the
            people who were there.
          </span>
        </li>
      </ul>

      <div className="card pitch-cta">
        {user ? (
          <>
            <p style={{ margin: 0 }}>
              Have a membership code from a donation or journal subscription?
            </p>
            <Link href="/settings">
              <button style={{ marginTop: "0.75rem" }}>Redeem it in Settings</button>
            </Link>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>Start with a free account — membership can come later.</p>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <Link href="/signup">
                <button>Sign up free</button>
              </Link>
              <Link href="/login">
                <button className="secondary">Log in</button>
              </Link>
            </div>
          </>
        )}
      </div>
      <p className="meta" style={{ marginTop: "1rem" }}>
        Membership never gates reading. The public feed and archive stay open to everyone.
      </p>
    </div>
  );
}
