import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — The New York Philosophy Club Forum",
  description:
    "What the forum collects, why, who can see it, and how to get it back or delete it.",
};

/**
 * Required by the App Store (a reachable privacy policy URL is mandatory in
 * App Store Connect) and by GDPR/CCPA.
 *
 * Every claim here is checked against what the code actually does — if a
 * feature changes what is collected or shared, this page must change with it.
 * A privacy policy that overstates or understates is worse than none.
 */
export default function PrivacyPage() {
  return (
    <div className="prose-page">
      <Link href="/" className="back-link">
        ← Back to the forum
      </Link>
      <h1 className="page-title">Privacy Policy</h1>
      <p className="meta">Last updated 1 August 2026</p>

      <p>
        This forum is run by the <strong>New York Philosophy Club</strong>, a
        501(c)(3) non-profit. We collect as little as the forum needs to work,
        we do not sell anything to anyone, and there is no advertising or
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
          you a password reset if you ask for one. It is never shown publicly.
        </li>
        <li>
          <strong>Your password</strong>, stored only as a one-way
          cryptographic hash. Nobody at the Club can read it, including us.
        </li>
      </ul>

      <h3>When you use the forum</h3>
      <ul>
        <li>
          <strong>What you post</strong> — threads, replies, and the likes you
          give. Public.
        </li>
        <li>
          <strong>Direct messages.</strong> Private between you and the
          recipient. Administrators do not read them routinely, but they are
          stored unencrypted in our database, so please treat them as private
          rather than secret.
        </li>
        <li>
          <strong>Anything you upload</strong> — a profile photo, images in
          posts. We strip location data (EXIF) from photos before storing them,
          so a photo you upload does not reveal where it was taken.
        </li>
        <li>
          <strong>Optional profile details</strong> — a short bio, your
          interests, whether you want to appear in the member directory. The
          directory is off unless you turn it on.
        </li>
      </ul>

      <h3>If you choose to verify your identity</h3>
      <p>
        Identity verification is optional. If you use it, the ID check is
        performed by a third-party provider — we receive only{" "}
        <strong>the pass/fail result</strong>. Your identity document is never
        sent to us and never stored on our servers.
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
          <strong>Anyone on the internet:</strong> your name, your public posts
          and replies, your profile photo and bio.
        </li>
        <li>
          <strong>Signed-in members:</strong> the same, in full rather than as
          a preview.
        </li>
        <li>
          <strong>Members of a chapter:</strong> posts inside that chapter.
          Chapter content is not visible to anyone else, including via search
          or a direct link.
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
        only with the services required to run the forum:
      </p>
      <ul>
        <li>Our hosting and database providers, which store the data</li>
        <li>Our identity verification provider, only if you choose to verify</li>
        <li>
          Apple and Google&apos;s push notification services, only if you turn
          on notifications — they receive a device token, not your messages
        </li>
      </ul>
      <p>
        We may also disclose information if legally required to, or to protect
        someone&apos;s safety.
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
          don&apos;t collapse into nonsense — this is deliberate, and it means
          deletion is not total erasure. If you need a post itself removed,
          delete it before deleting your account, or write to us.
        </li>
      </ul>
      <p>
        If you are in the EU or UK, or in California, you have additional
        rights over your data — including access, correction, and erasure.
        Write to us and we will honour them.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Passwords are hashed, never stored in readable form. Traffic is
        encrypted in transit. Access to the database is limited to the people
        who maintain the forum. No system is perfectly secure, and we
        won&apos;t claim otherwise — but we do not keep data we do not need,
        which is the most reliable protection there is.
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
