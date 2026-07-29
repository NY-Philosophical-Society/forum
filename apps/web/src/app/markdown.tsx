"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * react-markdown does not render raw HTML unless rehype-raw is added — we
 * deliberately don't, so post bodies can't inject markup.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links from members are untrusted: open in a new tab without
          // handing the opener over.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

type Wrap = { before: string; after?: string; line?: boolean; placeholder: string };

const ACTIONS: { label: string; title: string; className?: string; wrap: Wrap }[] = [
  { label: "B", title: "Bold  **text**", className: "md-bold", wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { label: "i", title: "Italic  *text*", className: "md-italic", wrap: { before: "*", after: "*", placeholder: "italic text" } },
  { label: "❝", title: "Quote  > text", wrap: { before: "> ", line: true, placeholder: "quoted text" } },
  { label: "•", title: "Bullet list  - item", wrap: { before: "- ", line: true, placeholder: "list item" } },
  { label: "1.", title: "Numbered list  1. item", wrap: { before: "1. ", line: true, placeholder: "list item" } },
  { label: "🔗", title: "Link  [text](url)", wrap: { before: "[", after: "](https://)", placeholder: "link text" } },
];

/**
 * Textarea with a small markdown toolbar. Keeps the raw markdown visible —
 * no WYSIWYG — so what you type is what gets stored.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = "160px",
  required,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(wrap: Wrap) {
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const text = selected || wrap.placeholder;

    let insert: string;
    let from: number;
    let to: number;

    if (wrap.line) {
      // Prefix every line of the selection (or the current line).
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const body = selected || wrap.placeholder;
      insert = body
        .split("\n")
        .map((l) => wrap.before + l)
        .join("\n");
      const next = value.slice(0, lineStart) + insert + value.slice(end);
      onChange(next);
      from = lineStart + wrap.before.length;
      to = lineStart + insert.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(from, to);
      });
      return;
    }

    insert = wrap.before + text + (wrap.after ?? "");
    onChange(value.slice(0, start) + insert + value.slice(end));
    from = start + wrap.before.length;
    to = from + text.length;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(from, to);
    });
  }

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`md-tool ${a.className ?? ""}`}
            title={a.title}
            aria-label={a.title}
            onClick={() => apply(a.wrap)}
          >
            {a.label}
          </button>
        ))}
        <a className="md-help" href="/formatting" target="_blank" rel="noopener noreferrer">
          Formatting help
        </a>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight }}
        required={required}
      />
    </div>
  );
}
