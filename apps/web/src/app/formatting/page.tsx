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
          "> The unexamined life is not worth living for a human being.\n>\n> — Socrates, *Apology* 38a"
        }
      />

      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Add a second <code>&gt;</code> to nest a quote inside a quote — useful when you are
        answering someone who was themselves quoting a source.
      </p>
      <Example
        source={
          "> You cited Hume approvingly here:\n>\n>> Reason is, and ought only to be the slave of the passions.\n>\n> But that is precisely the claim I want to resist."
        }
      />

      <h3>Links</h3>
      <Example source={"[Stanford Encyclopedia of Philosophy](https://plato.stanford.edu)"} />

      <h3>Lists</h3>
      <Example source={"- First premise\n- Second premise\n- Conclusion"} />
      <Example source={"1. First premise\n2. Second premise\n3. Conclusion"} />

      <h3>Headings</h3>
      <Example source={"## A section\n\n### A subsection"} />

      <h3>Code</h3>
      <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
        Backticks for inline notation, three backticks for a block — handy for logical formulae.
      </p>
      <Example source={"Inline: `P → Q`\n\n```\n(P → Q) ∧ P\n∴ Q\n```"} />

      <h3>Horizontal rule</h3>
      <Example source={"Above the line.\n\n---\n\nBelow the line."} />

      <p className="notice" style={{ marginTop: "var(--space-6)" }}>
        Raw HTML is not rendered — it will appear as plain text. That is deliberate.
      </p>
    </div>
  );
}
