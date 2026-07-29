"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mentionMarkdown, type ImageUploadResponse, type PublicUser } from "@nyps-forum/shared";
import { api, API_URL } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

/** Final pixel size baked into upload URLs by the API (…-800x600.jpg). */
function dimensionsFromUrl(src: string): { width: number; height: number } | null {
  const m = src.match(/-(\d+)x(\d+)\.jpg$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** Only our own uploads render as images — see the <img> override below. */
function isOwnUpload(src: string): boolean {
  return src.startsWith(`${API_URL}/uploads/`) || src.startsWith("/uploads/");
}

/**
 * react-markdown does not render raw HTML unless rehype-raw is added — we
 * deliberately don't, so post bodies can't inject markup.
 */
export function Markdown({ children }: { children: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Internal links (mentions, cross-references) stay in this tab;
          // links from members to the outside world are untrusted and open
          // in a new tab without handing the opener over. react-markdown
          // already neuters javascript: URLs (defaultUrlTransform).
          a: ({ href, children }) => {
            if (href?.startsWith("/")) {
              const isMention = href.startsWith("/u/");
              return (
                <Link href={href} className={isMention ? "mention" : undefined}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            );
          },
          // Only images we host render inline: an external URL in a post
          // would let an author log readers' IPs (a tracking pixel on a
          // real-name forum), so it degrades to a plain link instead. Our
          // upload URLs carry their pixel size, so space is reserved
          // before the bytes arrive — no layout shift.
          img: ({ src, alt }) => {
            if (!src || !isOwnUpload(src)) {
              return src ? (
                <a href={src} target="_blank" rel="noopener noreferrer nofollow">
                  {alt || src}
                </a>
              ) : null;
            }
            const dims = dimensionsFromUrl(src);
            return (
              <button
                type="button"
                className="md-image-button"
                onClick={() => setLightbox(src)}
                aria-label={alt ? `View image: ${alt}` : "View image"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="md-image"
                  src={src}
                  alt={alt ?? ""}
                  loading="lazy"
                  {...(dims
                    ? { width: dims.width, height: dims.height, style: { aspectRatio: `${dims.width} / ${dims.height}` } }
                    : {})}
                />
              </button>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Image viewer"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" />
          <button type="button" className="lightbox-close" aria-label="Close image viewer">
            ✕
          </button>
        </div>
      )}
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

/** The `@name` fragment being typed just before the caret, if any. */
function mentionQueryAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]{1,30})$/);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/**
 * Textarea with a markdown toolbar, an image-upload button, an @mention
 * autocomplete, and a write/preview toggle. Keeps the raw markdown visible —
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
  const fileRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<PublicUser[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  // Debounced people-search for the @mention menu. The endpoint already
  // excludes blocked users in both directions, so the menu can't offer a
  // mention the server would refuse to record.
  useEffect(() => {
    if (!mention || !token) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(
          `/api/users?search=${encodeURIComponent(mention.query)}`,
          token,
        )
        .then((res) => {
          setSuggestions(res.users.slice(0, 6));
          setHighlighted(0);
        })
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [mention?.query, mention?.start, token]); // eslint-disable-line react-hooks/exhaustive-deps

  function syncMentionState(nextValue: string) {
    const el = ref.current;
    if (!el) return;
    // selectionStart is already updated inside change/click/key handlers.
    setMention(mentionQueryAt(nextValue, el.selectionStart));
  }

  function insertMention(user: PublicUser) {
    const el = ref.current;
    if (!el || !mention) return;
    const caret = el.selectionStart;
    const inserted = `${mentionMarkdown(user.displayName, user.id)} `;
    const next = value.slice(0, mention.start) + inserted + value.slice(caret);
    onChange(next);
    setMention(null);
    setSuggestions([]);
    const pos = mention.start + inserted.length;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadImage(file: File) {
    if (!token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.upload<ImageUploadResponse>("/api/uploads/image", file, token);
      const el = ref.current;
      const caret = el ? el.selectionStart : value.length;
      const embed = `![image](${res.url})`;
      // On its own line so it renders as a block, not mid-sentence.
      const before = value.slice(0, caret);
      const after = value.slice(caret);
      const prefix = before === "" || before.endsWith("\n") ? "" : "\n\n";
      const suffix = after.startsWith("\n") || after === "" ? "\n" : "\n\n";
      onChange(before + prefix + embed + suffix + after);
    } catch (err: any) {
      setUploadError(err.message ?? "Could not upload that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setMention(null);
      setSuggestions([]);
    }
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
            disabled={preview}
            onClick={() => apply(a.wrap)}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          className="md-tool"
          title="Insert image"
          aria-label="Insert image"
          disabled={preview || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "…" : "🖼"}
        </button>
        <button
          type="button"
          className={`md-tool md-preview-toggle ${preview ? "md-tool-active" : ""}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "Write" : "Preview"}
        </button>
        <a className="md-help" href="/formatting" target="_blank" rel="noopener noreferrer">
          Formatting help
        </a>
      </div>
      {preview ? (
        <div className="md-preview" style={{ minHeight }}>
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="meta">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <div className="md-input-wrap">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              syncMentionState(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onClick={() => syncMentionState(value)}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            placeholder={placeholder}
            style={{ minHeight }}
            required={required}
          />
          {mention && suggestions.length > 0 && (
            <ul className="mention-menu" role="listbox" aria-label="Mention a member">
              {suggestions.map((u, i) => (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    className={`mention-option ${i === highlighted ? "mention-option-active" : ""}`}
                    // onMouseDown so it beats the textarea's blur.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(u);
                    }}
                  >
                    @{u.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {uploadError && <p className="error">{uploadError}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
        }}
      />
    </div>
  );
}
