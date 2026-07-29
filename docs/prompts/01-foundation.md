# 01 — Foundation: design system, visual polish, mobile parity

> Read `docs/prompts/README.md` first — it holds the palette, the locked product
> decisions, the standing constraints, and the verification bar. This brief
> assumes all of it.

## Context

`nyps-forum` — npm-workspaces monorepo for the New York Philosophical Society's
member forum.

```
apps/api/         Express + Prisma (SQLite dev) + JWT — do not modify in this brief
apps/web/         Next.js 14 App Router
apps/mobile/      Expo / React Native (iOS primary)
packages/shared/  zod schemas, TS types, formatDate, flattenPostTree
```

`npm install` at root. API :4000 (`npm run dev:api`), web :3000 (`npm run dev:web`),
mobile `npm run dev:mobile`. Seeded with 12 tags, 5 threads with nested replies,
and admin `admin@demo.nyphilosophy.org` / `demo-password-123`.

## Goal

A polish pass, not a redesign. Every screen should feel as considered as the
login/signup cards. You may restructure a page's layout and visual hierarchy —
spacing, grouping, metadata rows, reading flow — but keep the brand and the
information architecture. **No new product features in this brief.**

## 1. Build the design-system layer

**Web** — CSS custom properties in `apps/web/src/app/globals.css` for spacing,
radius, type scale, and shadows, alongside the color tokens already there. Refactor
every page off ad-hoc inline styles and one-off values onto these.

**Mobile** — a matching token object in `apps/mobile/src/lib/theme.ts` (spacing /
radius / type alongside the existing `ThemeColors`), surfaced through the existing
`useSettings()` context. Extend the `makeStyles(colors)` pattern to carry the full
token set, not just colors.

**Both** — extract shared components and compose every screen from them rather than
restyling from scratch:

`Card` · `Button` (primary / secondary / tertiary) · `Field` (label + input +
error) · `EmptyState` · `Skeleton` · `Badge` · `Chip` · `Avatar` (initials-only for
now — brief 02 adds real photos, so build the API to accept an optional image URL)

### Palette gaps you must resolve deliberately

The Editorial palette doesn't specify these. Pick one answer for each and apply it
everywhere — don't improvise per page:

1. **Card / elevated surface.** The page is `stone`. Cards must separate from it:
   pure white, or `stone-2`. Pick one.
2. **Border / hairline.** Derive a single warm neutral (low-opacity `ink`, or a
   `stone-2`-adjacent tone). One value, not several.
3. **Danger / destructive.** `terracotta` is the *accent*; the current danger red
   `#a3342a` is close enough to collide with it. Make destructive states clearly
   distinguishable — darken/desaturate danger, or reserve terracotta strictly for
   accent and let destructive read as a deeper brick.

### Typography — actually load the fonts

`globals.css` currently declares `font-family: Georgia, "Libre Baskerville", serif`.
Georgia always wins, so Libre Baskerville never renders and no webfont is loaded
anywhere — the whole app is Georgia today.

Load **Libre Baskerville** (headings + body) and **Newsreader** (display / buttons)
properly on web, and the equivalents on mobile via `expo-font`. Express sizes as
type-scale tokens, not per-page font sizes.

## 2. Polish every screen

**Web** (`apps/web/src/app/`): `page.tsx` (feed) · `t/[id]/` (thread) ·
`new-thread/` · `messages/` + `messages/[userId]/` · `settings/` · `verify/` +
`verify/mock/[sessionId]/` · `admin/reports/` · `forgot-password/` ·
`reset-password/` · `oauth/mock/[provider]/` · `nav.tsx` · `profile-menu.tsx` ·
`report-button.tsx` · `oauth-buttons.tsx`

`login/` and `signup/` were recently redone — keep their structure, but pull them
onto the shared tokens and components like everything else.

**Mobile** (`apps/mobile/src/screens/`): `HomeScreen` · `ThreadScreen` ·
`NewThreadScreen` · `MessagesScreen` · `ConversationScreen` · `SettingsScreen` ·
`VerifyScreen` · `VerifyMockScreen` · `LoginScreen` · `SignupScreen` ·
`MockOAuthScreen`, plus `components/OAuthButtons.tsx` and `VerificationBadge.tsx`

Also in this pass:

- **Loading skeletons.** Every bare `"Loading..."` becomes a skeleton shaped like
  the content it's standing in for.
- **Empty states.** Empty feed, tag filter with no threads, no conversations, empty
  conversation, no open reports. Each gets an intentional designed state, not one
  line of muted text.

## 3. Mobile: replace the text-link row with a bottom tab bar

`HomeScreen` renders a horizontal row of text links
(`Verify · Messages · Settings · Log out`) above the feed. It's the least native
thing in the app.

Replace with a **bottom tab bar** — Feed / Messages / Profile, unread badge on
Messages. Restructure `App.tsx`'s `AppStack` into a tab navigator with stacks
inside it (install `@react-navigation/bottom-tabs`). Move Verify, Settings, and
Log out under the Profile tab.

**Keep the auth gate exactly as it is**: `AuthStack` when logged out, tabs only
once `useAuth().user` is non-null.

## 4. Close the mobile parity gap

These exist on web and not on mobile. All the endpoints are built and tested —
this is porting, not designing new features. Build them from the shared components
you just extracted:

- Report buttons (thread / post / user)
- Block & unblock, with the blocked-state notice in a conversation
- "Load more" pagination — feed, thread replies, message history
- Forgot-password and reset-password screens
- The account-linked toast after Google/Apple sign-in onto an existing account
- Thread lock / unlock controls for admins, and the locked-thread notice
- Supporter access-code redemption in Settings
- The admin reports list

If any one of these doesn't fit the mobile IA cleanly, say so in your summary
rather than forcing it.

## Out of scope

Notifications · search · markdown or images in posts · profile pages · avatars ·
post editing · chapters · admin *actions* beyond the existing read-only report
list · any change to `apps/api` or `packages/shared` types.

## Acceptance

Per the standard bar in `README.md`: clean typecheck in all three packages; web
verified at 1280px and 375px in light mode with screenshots; one dark-mode sanity
pass; iOS verified live in the Simulator; a per-screen written summary.
