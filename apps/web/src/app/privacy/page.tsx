import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — The New York Philosophy Club",
  description:
    "What the forum collects, why, who can see it, and how to get it back or delete it.",
};

/**
 * Required by the App Store (App Store Connect will not accept a submission
 * without a reachable privacy policy URL) and by GDPR/CCPA.
 *
 * Every factual claim on this page was checked against the code:
 *   - "one-way hash"        -> passwords live in Supabase Auth, never in our tables
 *   - "we strip EXIF"       -> lib/avatar-image.ts re-encodes through a canvas
 *   - "export your data"    -> GET  /api/users/me/export
 *   - "delete your account" -> DELETE /api/users/me, posts kept as "[deleted]"
 *
 * If a feature changes what is collected or shared, this page changes with it.
 * A privacy policy that overstates is worse than no policy at all.
 */
export default function PrivacyPage() {
  return (
    <div className="prose-page">
      <Link href="/" className="back-link">
        ← Back to the forum
      </Link>
      <h1 className="page-title">Privacy Policy</h1>
      <p className="meta">Last updated 8 August 2026</p>

      <p>
        This forum is run by the <strong>New York Philosophy Club</strong>, a
        501(c)(3) non-profit. We collect as little as the forum needs to work,
        we do not sell anything to anyone, and there is no advertising and no
        third-party tracking anywhere in it.
      </p>

      <h2>What we collect</h2>

      <h3>When you create an account</h3>
      <ul>
        <li>
          <strong>Your name.</strong> We ask for your real first and last name,
          because this is a real-name community. It is shown publicly on
          everything you post.
        </li>
        <li>
          <strong>Your email address.</strong> Used to sign you in and to send
          a password reset if you ask for one. It is never shown publicly.
        </li>
        <li>
          <strong>Your password</strong>, stored by our authentication provider
          only as a one-way cryptographic hash. Nobody at the Club can read it.
          If you sign in with Google or Apple instead, we never see a password
          at all — only that the provider vouched for you, and your email
          address.
        </li>
      </ul>

      <h3>When you use the forum</h3>
      <ul>
        <li>
          <strong>What you post</strong> — threads, replies, and the likes you
          give. Public.
        </li>
        <li>
          <strong>Direct messages.</strong> Private between you and the person
          you are writing to. Administrators do not read them routinely, but
          they are stored unencrypted in our database, so please treat them as
          private rather than secret.
        </li>
        <li>
          <strong>Anything you upload</strong> — a profile photo, images in
          posts. Profile photos are re-encoded before they are stored, which
          removes embedded metadata, so a photo you upload does not carry the
          location it was taken.
        </li>
        <li>
          <strong>Optional profile details</strong> — a short bio, your
          interests, whether you appear in the member directory. The directory
          is off unless you turn it on.
        </li>
        <li>
          <strong>A device token</strong>, only if you turn on push
          notifications, so Apple or Google can deliver them.
        </li>
      </ul>

      <h3>If you choose to verify your identity</h3>
      <p>
        Identity verification is <strong>optional</strong>. The forum runs on
        an honor system: we trust the name you give us, and you can post
        straight away. If you do choose to verify, the ID check is carried out
        by a specialist third-party provider and we receive only{" "}
        <strong>the pass/fail result</strong>. Your identity document is never
        sent to us and is never stored on our servers.
      </p>

      <h3>What we do not collect</h3>
      <p>
        No advertising identifiers. No analytics or tracking pixels. No
        location data. No contacts. We do not build a profile of you for any
        purpose beyond running the forum.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Anyone on the internet:</strong> your name, your public
          threads and replies, your profile photo and bio.
        </li>
        <li>
          <strong>Signed-in members:</strong> the same, in full rather than as
          a preview.
        </li>
        <li>
          <strong>Members of a chapter:</strong> posts inside that chapter.
          Chapter content is not visible to anyone else, including through
          search or a direct link.
        </li>
        <li>
          <strong>Only the two of you:</strong> direct messages.
        </li>
        <li>
          <strong>Only you:</strong> your email address, your saved threads,
          your notification settings.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        <strong>We do not sell or rent your data, ever.</strong> We share it
        only with the services needed to run the forum:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — hosts our database and handles sign-in
        </li>
        <li>
          <strong>Vercel</strong> — hosts and serves the site itself
        </li>
        <li>
          <strong>Google or Apple</strong> — only if you choose to sign in with
          them, or if you turn on push notifications, in which case they
          receive a device token and not your messages
        </li>
        <li>
          <strong>Our identity verification provider</strong> — only if you
          choose to verify
        </li>
      </ul>
      <p>
        We may also disclose information if we are legally required to, or to
        protect someone&apos;s safety.
      </p>

      <h2>Your rights</h2>
      <p>
        From <strong>Settings → Account</strong>, at any time and without
        asking anyone:
      </p>
      <ul>
        <li>
          <strong>Export your data</strong> — download everything we hold about
          you as a file.
        </li>
        <li>
          <strong>Delete your account.</strong> Your name, email, photo and bio
          are permanently removed. Your posts remain, attributed to
          &ldquo;[deleted]&rdquo;, so that other people&apos;s conversations
          don&apos;t collapse into nonsense. This is deliberate, and it means
          deletion is not total erasure — if you need a particular post gone,
          delete it before you delete your account, or write to us.
        </li>
      </ul>
      <p>
        If you are in the EU or UK, or in California, you have additional
        rights over your data — including access, correction, and erasure.
        Write to us and we will honour them.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Passwords are hashed and never stored in readable form. Traffic is
        encrypted in transit. Access to the database is limited to the people
        who maintain the forum. No system is perfectly secure and we won&apos;t
        claim otherwise — but we do not keep data we do not need, which is the
        most reliable protection there is.
      </p>

      <h2>Children</h2>
      <p>
        The forum is not intended for anyone under 16. We do not knowingly
        collect information from children. If you believe a child has created
        an account, please tell us and we will remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that meaningfully affects you,
        we&apos;ll say so in the forum rather than quietly editing this page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, requests, or complaints:{" "}
        <a href="mailto:info@nyphilosophy.org">info@nyphilosophy.org</a>.
      </p>

      <p className="meta" style={{ marginTop: "2rem" }}>
        See also the <Link href="/terms">Terms of Use</Link>.
      </p>
    </div>
  );
}
