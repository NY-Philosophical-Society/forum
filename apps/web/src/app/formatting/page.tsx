"use client";

import Link from "next/link";
import { Markdown } from "../markdown";

/** Source on the left, rendered result on the right. */
function Example({ source }: { source: string }) {
  return (
    <div className="guide-row">
      <pre className="guide-source">{source}</pre>
      <div className="guide-result">
        <Markdown>{source}</Markdown>
      </div>
    </div>
  );
}

export default function FormattingPage() {
  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to the feed
      </Link>

      <h1 className="page-title">Formatting</h1>
      <p className="meta" style={{ marginBottom: "var(--space-6)" }}>
        Posts and replies are written in Markdown. The composer toolbar inserts most of this for
        you, but typing it directly is faster once you know it.
      </p>

      <h3>Emphasis</h3>
      <Example source={"**bold text**\n\n*italic text*\n\n***both at once***"} />

      <h3>Quotations</h3>
      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Start a line with <code>&gt;</code>. Quoting the text under discussion — or the person you
        are answering — is the backbone of an argument here.
      </p>
      <Example
        source={
          "> Custom is the great guide of human life.\n>\n> — David Hume, *An Enquiry Concerning Human Understanding* V.i"
        }
      />

      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Add a second <code>&gt;</code> to nest a quote inside a quote — useful when you are
        answering someone who was themselves quoting a source.
      </p>
      <Example
        source={
          "> You cited Mill approvingly here:\n>\n>> The only freedom which deserves the name is that of pursuing our own good in our own way.\n>\n> But that is precisely the claim I want to resist."
        }
      />

      <h3>Links</h3>
      <Example source={"[Stanford Encyclopedia of Philosophy](https://plato.stanford.edu)"} />

      <h3>Lists</h3>
      <Example source={"- Free will\n- Moral luck\n- Personal identity"} />
      <Example
        source={"1. State the claim\n2. Give the argument\n3. Answer the strongest objection"}
      />

      <h3>Code</h3>
      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Backticks for inline notation, three backticks for a block — handy for logical formulae.
      </p>
      <Example source={"Inline: `P → Q`\n\n```\n(P → Q) ∧ P\n∴ Q\n```"} />

      <h3>Mentions</h3>
      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Type <code>@</code> followed by a member&apos;s name in the composer and pick them from the
        list — the mention becomes a link to their profile. (Under the hood it&apos;s an ordinary
        markdown link to <code>/u/&lt;their id&gt;</code>.)
      </p>

      <h3>Images</h3>
      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Use the 🖼 toolbar button to upload a picture (JPEG, PNG, or WebP, up to 4MB) — it is
        inserted as <code>![image](url)</code> where your cursor is. Only images uploaded here
        render inline; a link to an image elsewhere on the web stays a link, so nobody can use a
        post to track its readers.
      </p>

      <p className="notice" style={{ marginTop: "var(--space-6)" }}>
        Raw HTML is not rendered — it will appear as plain text. That is deliberate.
      </p>
    </div>
  );
}
