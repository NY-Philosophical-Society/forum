# Run report — brief-03-content

Implements `docs/prompts/03-content.md` (edit/delete, markdown, image embeds,
@mentions) on API, web, and mobile. Branched off `brief-02-profiles` HEAD
(`4880664`), which was present as expected — the storage provider and profile
pages from brief 02 were reused, not rebuilt.

## Commits

1. `API: edit/delete with soft-delete tombstones, structural Mention model` —
   schema migration (`editedAt`/`deletedAt` on Thread and Post, new `Mention`
   model), `PATCH`/`DELETE /api/threads/:id` and `/api/posts/:id`, tombstone
   serialization, mention sync on create/edit/delete, block-aware user search,
   `stripMarkdown` + mention helpers in `packages/shared`, 15 new API tests +
   6 shared tests.
2. `API: post image uploads through the shared storage provider` —
   `POST /api/uploads/image` (same MIME allowlist and 8MB cap as avatars,
   sharp re-encode, EXIF strip, ≤1600px, dimensions baked into the key),
   4 tests.
3. `Web: composer with preview, @mention autocomplete, image embeds` —
   MarkdownEditor grows a write/preview toggle, image upload button, and
   @ autocomplete; renderer handles mention links in-tab, renders only
   own-storage images (with reserved aspect ratio + lightbox); markdown bios;
   stripped plain-text previews.
4. `Web: edit/delete own threads and replies, tombstones, edited indicator`.
5. `Mobile: markdown composer, edit/delete own content, tombstones, image
   embeds` — new `MarkdownComposer` component, `EditThread` screen, inline
   reply editing, native image viewer, mention navigation.
6. `docs: formatting guides cover mentions and images; README content notes`.
7. This report.

## Key design decisions (made at ambiguities)

- **Mention syntax is a plain markdown profile link**: `[@Ada Lovelace](/u/<id>)`.
  Composers insert it via autocomplete; every renderer shows a profile link for
  free; the API re-parses it with a shared helper (`extractMentionUserIds`) to
  keep the structural table in sync. No second syntax to parse.
- **`Mention` model shape** (brief 05 depends on this):
  ```prisma
  model Mention {
    id        String   @id @default(cuid())
    userId    String    // the mentioned user (notification recipient)
    authorId  String    // who wrote it; never equals userId (self-mentions skipped)
    threadId  String?   // set for mentions in a thread's opening post
    postId    String?   // set for mentions in a reply — exactly one of the two is set
    createdAt DateTime @default(now())
    @@unique([userId, threadId])
    @@unique([userId, postId])
    @@index([userId, createdAt])
  }
  ```
  Rows are *synced* on edit (stale ones deleted, existing ones keep their
  `createdAt`) and cleared when the containing content is deleted — so a row
  here is always a live mention, and brief 05 can consume the table without
  re-checking prose. A post mention's `threadId` is null; join through
  `post.thread` if the thread is needed.
- **Soft-delete semantics**: deleted replies serialize as tombstones (`body: ""`,
  author `[deleted]` with **empty id** so clients don't link to a profile,
  `deleted: true`) — but only if something visible survives below them;
  childless deleted replies are dropped from the response entirely. Deleted
  threads keep their page (so surviving replies stay readable and reply
  permalinks keep working) with title/body/author tombstoned, but leave the
  feed, profile listings, and counts. Deleted-thread pages are frozen: no new
  replies, likes, or edits. The original body stays in the DB row as the audit
  trail the task asked for; it is never serialized after deletion.
- **`flattenPostTree` untouched** — the server always includes a tombstoned
  parent for surviving children, so the existing tree logic works as-is.
- **External images don't render.** Markdown `![](https://elsewhere/x.png)`
  degrades to a plain link on both platforms; only URLs from our own storage
  render inline. Reason: an external image URL is a tracking pixel that logs
  every reader's IP on a real-name forum, and only our own uploads carry the
  baked-in `-WxH.jpg` dimensions that make the no-layout-shift requirement
  satisfiable. This also keeps the moderation surface to images that went
  through our size/type pipeline. Noted in both formatting guides.
- **Locked-thread edits**: rejected for authors (403); admins may still edit
  (they can unlock at will anyway). Editing requires the author to still be
  VERIFIED (consistent with the write gate); deletion requires only ownership.
- **`editedAt` is stamped on every successful PATCH**, including admin edits —
  the indicator shows the content changed, not who changed it.
- **Block enforcement for mentions** happens in two places: the autocomplete
  uses `GET /api/users?search=`, which now excludes blocked/blocking users, and
  `syncMentions` re-checks blocks server-side, so even a hand-typed profile
  link across a block never creates a Mention row (tested). The *link itself*
  still renders if hand-typed — markdown can link to any URL — but it can
  never become a notification.
- **DMs stay plain text** (brief's default). Feed cards never had bodies;
  profile reply quotes and the anonymous thread teaser now go through
  `stripMarkdown` instead of rendering markdown.
- **Prompts README says "apps/api is feature-complete for briefs 01–03 and
  should not be modified by them"** — that is stale: the API had no editedAt/
  deletedAt/Mention/uploads route, and brief 03 itself specifies API work. I
  followed the brief.

## What I skipped or narrowed

- **Mobile still has no nested reply-to UI** (replies are top-level only, as
  before). That's a brief-01 parity item, not part of this brief; edit/delete
  work on nested replies fine when they exist.
- **No keyboard navigation on the mobile mention menu** (tap to select); web
  has full arrow/Enter/Escape handling.
- **Image lightbox on mobile is a plain full-screen modal** (tap to dismiss,
  pinch-zoom not implemented — would need a gesture library the project
  doesn't have).
- **Data export still includes soft-deleted posts' bodies.** Deliberate: it's
  the user's own content and the row still exists. Flag for the compliance
  review if that's wrong.

## Verification (actual results, run at the end)

```
apps/api        npx tsc --noEmit   → clean (exit 0)
apps/web        npx tsc --noEmit   → clean (exit 0)
apps/mobile     npx tsc --noEmit   → clean (exit 0)
packages/shared npx tsc --noEmit   → clean (exit 0)
apps/web        npx next build     → succeeds; all routes compile
                                     (static + dynamic, no prerender errors)
apps/api        npm test           → Tests 115 passed (115)
packages/shared npx vitest run     → Tests 16 passed (16)
```

Acceptance items covered by automated tests: non-author 403 on PATCH (thread
and post), locked-thread edit rejection, delete-with-children tombstone (and
that the deleted text appears nowhere in the payload), deleted thread hidden
from feed but replies preserved, mention rows created/cleared, block
suppression both directions, upload dimension handling.

## Things a human should check

- **No in-browser or Simulator verification was done** — this run cannot start
  dev servers. The standard visual bar (1280px/375px screenshots, dark-mode
  pass, live iOS check) is outstanding. Highest-risk visual areas: the mention
  dropdown position inside the web editor, the mobile composer toolbar on
  small screens, and image sizing inside deeply nested replies.
- **XSS acceptance** (`<img src=x onerror=alert(1)>`, `javascript:` links) is
  guaranteed by renderer configuration (no `rehype-raw` on web — unchanged;
  react-native-markdown-display never evaluates HTML; react-markdown's default
  urlTransform neuters `javascript:`), but I could not click through it in a
  browser. Worth one manual pass.
- One API test run flaked once mid-development (the uploads suite's first
  run failed, then passed twice consecutively with identical code). I suspect
  parallel-file DB cleanup contention; if CI ever shows it again, look at
  `src/test/setup.ts` ordering.
- The web `Markdown` component now calls `useAuth` indirectly? (No — only
  `MarkdownEditor` does.) `MarkdownEditor` requires an `AuthProvider` ancestor;
  all current usages are inside the app layout, which provides it.
- Mentions of a user who is later blocked are not retroactively removed from
  the Mention table (only re-synced on the next edit). Brief 05 should
  re-check blocks at notification time if that matters.
