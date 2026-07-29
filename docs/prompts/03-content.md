# 03 — Content: editing, markdown, images, mentions

> Read `docs/prompts/README.md` first. Requires briefs 01 and 02 — this reuses the
> shared components from 01 and the storage provider and profile pages from 02.

## Goal

Make writing here feel like writing an argument rather than filling in a textarea.
Four capabilities, all of which the forum currently lacks.

## 1. Edit and delete your own posts

Today a thread or reply is permanent the instant it's sent — no typo fix, no
retraction.

- Edit your own thread (title, body, tags) and your own replies
- Show an **"edited"** indicator with the edit time; store `editedAt`
- Delete your own thread or reply. A deleted reply that has children must remain as
  a `[deleted]` tombstone so the thread below it doesn't orphan — reuse the
  `flattenPostTree` logic in `packages/shared`, don't fork it
- Admins can edit/delete anything (the `requireAdmin` middleware already exists)
- Locked threads reject edits as well as new replies

## 2. Markdown

Plain text only today. A philosophy forum needs at minimum **blockquote** — people
quote each other and quote texts constantly.

- Support: bold, italic, links, blockquote, ordered/unordered lists, inline code,
  code blocks, headings
- A composer with a formatting toolbar and a live preview toggle, on both platforms
- **Sanitize.** No raw HTML passthrough, no `dangerouslySetInnerHTML` on
  unsanitized input. Pick a renderer with a safe-by-default posture and an explicit
  allowlist. Say which library you chose and why.
- Render markdown in thread bodies, replies, and bios (from brief 02) — but keep
  DMs plain text unless it falls out for free
- Feed card previews strip markdown to plain text rather than rendering it

## 3. Image embeds in posts

Reuse the `StorageProvider` from brief 02 — do not build a second upload path.

- Insert an image into a thread or reply from web and mobile
- Same server-side size cap and MIME allowlist as avatars
- Images render responsively, never break the reading column, and never cause
  layout shift (reserve dimensions)
- Tapping/clicking opens a lightbox on web, a native viewer on mobile

Same moderation caveat as avatars — flag it, don't build it.

## 4. @mentions

- Type `@` in the composer → autocomplete of users (reuse the existing
  `GET /api/users?search=` endpoint)
- A mention renders as a link to that person's profile page (brief 02)
- Store mentions structurally, not just as text — brief 05 turns them into
  notifications, and re-parsing prose later is fragile
- Mentioning someone who has blocked you, or whom you've blocked, must not create a
  link or a future notification

## API work

- `PATCH /api/threads/:id` · `DELETE /api/threads/:id`
- `PATCH /api/posts/:id` · `DELETE /api/posts/:id`
- `POST /api/uploads/image` (via the same storage provider)
- A `Mention` model (post/thread → mentioned user), populated on create and edit
- `editedAt` and `deletedAt` on `Thread` and `Post`
- Apply `writeLimiter` to all new mutating routes

Ownership checks server-side: only the author or an admin may edit or delete. Do
not rely on the UI hiding the button.

## Out of scope

Notifications for mentions (brief 05 — just store the data) · search · drafts ·
link previews / unfurling · reactions beyond the existing like.

## Acceptance

Standard bar from `README.md`, plus:
- Post markdown with a blockquote and a code block; confirm it renders correctly on
  web and iOS and that the feed preview shows plain text.
- Confirm an XSS attempt in a post body is neutralized — try
  `<img src=x onerror=alert(1)>` and a `javascript:` link.
- Delete a reply that has children; confirm the children survive as a readable
  sub-thread.
- Confirm a non-author gets a 403 from `PATCH /api/posts/:id` directly, not just a
  hidden button.
