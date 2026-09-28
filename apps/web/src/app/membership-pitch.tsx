"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";

/**
 * The single membership page a non-member meets wherever a member space
 * begins — chapters, the directory. Deliberately a pitch, not an error page:
 * reading the forum stays free; supporter access opens private spaces.
 * Formal Society membership is a separate club-verified status.
 */
export function MembershipPitch() {
  const { user } = useAuth();

  return (
    <div className="pitch">
      <h1 className="pitch-title">Forum supporter access</h1>
      <p className="pitch-dek">
        The main forum stays free to read and join with an account. Supporter access opens
        private community spaces. Formal Society membership is confirmed separately by the club.
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
          <span className="perk-name">The supporter directory</span>
          <span className="perk-desc">
            Opt-in and supporter-only: photo, name, chapter, interests. The scarce good is finding
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
            and transcript after. Anyone may read; supporters carry the conversation on with the
            people who were there.
          </span>
        </li>
      </ul>

      <div className="card pitch-cta">
        {user && process.env.NODE_ENV === "production" ? (
          <p style={{ margin: 0 }}>Already eligible for supporter access? Contact the club to confirm it.</p>
        ) : user ? (
          <>
            <p style={{ margin: 0 }}>
              Have a local test code for supporter access?
            </p>
            <Link href="/settings">
              <button style={{ marginTop: "0.75rem" }}>Redeem it in Settings</button>
            </Link>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>Start with a free account — supporter access can come later.</p>
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
        Supporter access never gates reading. The public feed and archive stay open to everyone.
      </p>
    </div>
  );
}
