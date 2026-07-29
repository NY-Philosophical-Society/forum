# Build prompts — NYPS Forum v2

Six briefs, in dependency order. Run one at a time; each is independently
verifiable and leaves the app in a working state. You can stop after any of them.

| # | Brief | What it delivers |
| --- | --- | --- |
| 01 | [Foundation](01-foundation.md) | Design tokens, shared components, webfonts, full visual polish, mobile bottom tab bar, mobile feature parity |
| 02 | [Profiles & accounts](02-profiles-accounts.md) | Profile pages, avatar upload, edit profile, change password/email, delete account |
| 03 | [Content](03-content.md) | Edit/delete own posts, markdown, image embeds, @mentions |
| 04 | [Access & chapters](04-access-chapters.md) | Supporter-gated reading, chapter sub-forums |
| 05 | [Notifications & discovery](05-notifications-discovery.md) | In-app + push notifications, search, bookmarks |
| 06 | [Admin & moderation](06-admin-moderation.md) | Admin dashboard, thread pinning, structured report reasons |

**Why this order.** 01 first because everything after it composes the component
library — building profiles before the design system means rebuilding them. 02
before 03 because image embeds reuse the avatar upload infrastructure, and
@mentions link to profile pages. 04 after the UI is stable because it rewrites
auth middleware and is the one change that can lock everyone out. 05 after 03
because mention-notifications need mentions to exist.

---

## Decisions already made — don't relitigate these

**Product**
- Single feed, not category boards. Tags (`Ethics`, `Metaphysics`, `Logic`, …) are
  an optional filter, not a location. **Keep the existing 12 tag names and slugs
  exactly** — you may redesign how they look and how filtering works.
- Likes only. No downvotes, ever.
- Hot / New sort. Hot uses a stored `Thread.hotScore` recomputed on like/reply
  (`apps/api/src/lib/ranking.ts`) — it's a DB `ORDER BY`, not a JS sort.
- Real names required. Display name is the legal name tied to ID verification.
- Date format is a user setting (MM/DD/YYYY vs DD/MM/YYYY) and timestamps never
  show seconds. **Keep that function**; the UI for it is open to redesign. Always
  format via `formatDate`/`formatDateTime` from `packages/shared` — never call
  `toLocaleDateString` directly.

**Access model** (as of brief 04; before that, the current model stands)
1. Anonymous — truncated thread teaser + join wall on web. Mobile requires an
   account before anything.
2. Signed-up, not a supporter — same preview, with a "become a supporter" CTA.
3. Supporter — full reading.
4. Supporter + ID-verified — posting, replying, liking, DMing.

Supporter status is granted by redeeming an access code (`WISDOMKEY`, unlimited
use) — a deliberate placeholder for a real donation/subscription API check later.

**Design**
- Warm, literary, philosophical-society. Cream paper, deep navy ink, terracotta
  accent. Serif throughout. Built for long-form argument, not scroll.
- Editorial palette v1, shared with nyphilosophy.org — use these exact values:

  | Token | Hex | Role |
  | --- | --- | --- |
  | `stone` | `#FFFDF2` | Page background |
  | `stone-2` | `#FAF6E3` | Section bands / subtle raised fills |
  | `ink` | `#152B42` | Primary text, dark surfaces, primary buttons |
  | `ink-soft` | `#2A4050` | Hover state for ink surfaces |
  | `ink-muted` | `#5A6B76` | Tertiary text, subdued labels, metadata |
  | `terracotta` | `#96421F` | Accent — links, ticks, hairlines, hover marks |

- **Light mode is the design target.** A dark palette is coming separately; keep
  the existing dark-mode toggle working and give every new token a mechanically
  derived dark value, but don't art-direct dark mode.
- Same brand on web and mobile; platform-appropriate UX. Don't port web patterns
  (dropdown menus) literally to mobile — use sheets, native segmented controls,
  proper list rows.
- The `Φ` in the auth card is a placeholder. Leave it typographic; don't invent a
  Society logo.

## Standing constraints — apply to every brief

- **Never break these behaviors**: the anonymous read-preview wall
  (`thread.previewOnly`), the verification gate on posting/liking/replying/DMing,
  thread locking, user blocking, rate limiting, and the date-format setting.
- `npx tsc --noEmit` must pass clean in `apps/api`, `apps/web`, and `apps/mobile`.
- Mobile theming works by rebuilding StyleSheets from context —
  `const { colors } = useSettings()` then
  `useMemo(() => makeStyles(colors), [colors])`. `StyleSheet.create` can't react to
  theme changes. Never import a static color object into a screen.
- Web theming is `:root[data-theme="dark"]`, set by `SettingsProvider`.
- New third-party services follow the existing **provider pattern** — see
  `apps/api/src/lib/verification-provider.ts` and `oauth.ts`. Define the interface,
  ship a local stub that works without credentials, gate the real path behind env
  vars, and refuse to run the stub once real credentials are configured. Never
  block local development on a vendor account.
- Comments sparse and load-bearing, matching surrounding density.

## Verification bar

Every brief ends with:
1. `tsc --noEmit` clean in all three packages.
2. Web verified in-browser at **1280px and 375px**, light mode, with screenshots.
   One dark-mode pass to confirm nothing is broken or illegible.
3. iOS verified live in the **Simulator** — not just typechecked.
4. A short written summary of what changed, per screen.

> **iOS Simulator may not launch.** Xcode is installed but not selected as the
> active developer directory. If simulator tooling errors, tell the user to run
> `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` — it needs
> their password, you can't run it. Don't silently fall back to generic
> screen-control tools.

## Known state

**Web is ahead of mobile.** A feature pass landed on web and was never ported.
Brief 01 closes this gap. Web has and mobile lacks: report buttons, block/unblock,
"load more" pagination (feed / replies / messages), forgot- and reset-password
screens, the account-linked toast, thread lock controls, supporter code
redemption, and the admin reports list.

**`apps/api` is feature-complete for briefs 01–03** and should not be modified by
them. Briefs 04–06 do extend it.
