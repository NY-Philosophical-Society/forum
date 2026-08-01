import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use — The New York Philosophy Club Forum",
  description: "The rules of the forum, in plain language.",
};

/**
 * Apple requires an EULA or terms link for apps with user-generated content,
 * alongside a stated moderation policy — which is why the objectionable
 * content and enforcement sections below are specific rather than boilerplate.
 */
export default function TermsPage() {
  return (
    <div className="prose-page">
      <Link href="/" className="back-link">
        ← Back to the forum
      </Link>
      <h1 className="page-title">Terms of Use</h1>
      <p className="meta">Last updated 1 August 2026</p>

      <p>
        This forum is run by the <strong>New York Philosophy Club</strong>, a
        501(c)(3) non-profit, for philosophical discussion. Using it means
        agreeing to what follows.
      </p>

      <h2>Use your real name</h2>
      <p>
        This is a real-name community. We ask you to register under the name
        you actually go by, because philosophy is better when people stand
        behind what they say. Impersonating someone else is grounds for
        removal.
      </p>

      <h2>What isn&apos;t allowed</h2>
      <p>
        Vigorous disagreement is the entire point of this forum, and is
        welcome. These are not:
      </p>
      <ul>
        <li>Harassment, threats, or targeting an individual</li>
        <li>Hate speech, or attacks based on who someone is</li>
        <li>Sexual content, or anything involving minors</li>
        <li>Spam, advertising, or self-promotion unrelated to the discussion</li>
        <li>Posting other people&apos;s private information</li>
        <li>Illegal content, or content that infringes copyright</li>
        <li>Deliberately disrupting discussions or evading a ban</li>
      </ul>

      <h2>Moderation</h2>
      <p>
        Every post and every member can be reported, from the ⋯ menu on any
        piece of content. Reports go to a moderation queue that Club
        administrators review.
      </p>
      <p>
        We may remove content, lock a thread, or suspend an account that
        breaks these rules. Moderation actions are recorded with the reason and
        who took them. We aim to review reports of harassment or objectionable
        content <strong>within 24 hours</strong>.
      </p>
      <p>
        You can also <strong>block</strong> any member yourself, which stops
        messages between you in both directions, without waiting for us.
      </p>

      <h2>What you post</h2>
      <p>
        Your words stay yours. By posting, you give the Club permission to
        display and distribute them as part of the forum — nothing more. We
        will not sell your writing or license it to anyone else.
      </p>
      <p>
        Post only what is yours to post. If you quote someone, quote them
        properly.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself; you are responsible for what happens
        under your account. You may delete it at any time from Settings —{" "}
        <Link href="/privacy">the Privacy Policy</Link> explains exactly what
        deletion does and does not remove.
      </p>

      <h2>Membership and donations</h2>
      <p>
        Reading and posting are free. Membership — which supports the
        Club&apos;s events and journal — additionally opens chapters, the
        member directory, and event discussions. Donations support a non-profit
        and are not purchases of a service; they are not refundable, and
        membership does not entitle you to any particular content or outcome.
      </p>

      <h2>No warranty</h2>
      <p>
        The forum is provided as-is. We do our best to keep it running and
        keep your data safe, but we cannot guarantee it will always be
        available or error-free. To the extent the law allows, the Club is not
        liable for indirect or consequential damages arising from your use of
        it.
      </p>
      <p>
        Views expressed here belong to the people who post them, not to the
        New York Philosophy Club.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Meaningful changes will be announced in the
        forum rather than quietly edited in.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:info@nyphilosophy.org">info@nyphilosophy.org</a>
      </p>

      <p className="meta" style={{ marginTop: "2rem" }}>
        See also the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}
