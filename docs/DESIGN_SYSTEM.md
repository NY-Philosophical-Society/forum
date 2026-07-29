# NYPS Design System — v1

Editorial-modern palette for the New York Philosophical Society site. Stone
+ ink + terracotta. Use this document as the source of truth — any Claude
session (or human contributor) making UI changes should consult this file
before touching colors, dividers, or component variants.

## 1. Color tokens

Defined once in `src/styles/global.css` under `@theme`. Never hardcode
these values in a component; reference the CSS variable or Tailwind class.

| Token             | Hex       | Tailwind class    | Role                                            |
| ----------------- | --------- | ----------------- | ----------------------------------------------- |
| `--color-stone`   | `#FFFDF2` | `bg-stone`        | Page background — the main reading surface      |
| `--color-stone-2` | `#FAF6E3` | `bg-stone-2`      | Section surface, card fills, band alternation (warm cream) |
| `--color-ink`     | `#152B42` | `bg-ink text-ink` | Primary text, dark surfaces, primary CTA        |
| `--color-ink-soft`| `#2A4050` | `bg-ink-soft`     | Hover state for ink surfaces                    |
| `--color-ink-muted`| `#5A6B76`| `text-ink-muted`  | Tertiary text (footer notes, subdued labels)    |
| `--color-terracotta` | `#96421F` | `bg-terracotta` | Accent — hairlines, small badges, hover marks |

### Ink opacity ladder

Use these steps for text on stone/stone-2:

- `/90` — anchor text (rare emphasis)
- `/85` — body copy
- `/70` — subheadings, kickers
- `/55` — muted labels
- `/35` — placeholder text
- `/12` — hairlines

### Legacy aliases

`--color-paper` / `--color-paper-warm` / `--color-gold` / `--color-gold-deep`
still exist as live aliases, so existing `bg-paper`, `bg-paper-warm`,
`text-gold` utility classes keep resolving. They all point at the current
palette:

- `paper` → `#FFFDF2` (same as `stone`)
- `paper-warm` → `#FAF6E3` (same as `stone-2`, a warm yellow-cream one
  step warmer than the `stone` page background)
- `gold` / `gold-deep` → `#96421F` (same as `terracotta`)

Prefer `stone` / `stone-2` / `terracotta` names in new code. The one
thing that IS retired is the gold `::before` rule that used to sit on the
`.eyebrow` component — eyebrows now render as plain uppercase tracked
spans with no leading rule.

## 2. Typography

Unchanged from the current site — the type system is already correct.

- **Libre Baskerville** — `--font-serif` — all headings.
- **Newsreader** — `--font-display` — display type, feature headlines,
  button labels.
- **Helvetica Neue** — `--font-sans` — body copy, UI text.

Sizes are typically `clamp()` for headings so they scale between mobile
and desktop. Do not introduce new fonts.

## 3. Section divider hierarchy

Three tiers. Choose the lowest tier that reads. Do not stack tiers on the
same boundary.

### Tier 1 — Hairline (the quiet default)

Most section boundaries. Barely visible. Use for adjacent sections that
share a topic or don't change surface.

```html
<div style="border-top: 1px solid rgba(21, 43, 66, 0.10);"></div>
```

Or via Tailwind: `border-t border-ink/10`.

### Tier 2 — Surface shift (rhythm)

Alternate `stone` (`#FFFDF2`) and `stone-2` (`#FAF6E3`) as full-bleed
bands. The color change alone divides the sections; do not add a rule
on top of a surface shift.

Use for content bands with distinct roles: Volunteer → Donate, Journal
grid → Subscribe, Fellowship intro → Info pills.

The `stone-2` value (`#FAF6E3`) is a warm yellow-cream, one step warmer
than the `stone` page background, so surface-shift bands read as a
distinct but related surface.

### Tier 3 — Terracotta chapter tick (reserved emphasis)

Small centered terracotta bar sitting on the hairline where two sections
meet. Reserved for major "chapter" transitions.

```html
<div style="position: relative; border-top: 1px solid rgba(21, 43, 66, 0.10);">
  <div style="position: absolute; top: -1px; left: 50%;
              transform: translateX(-50%); width: 48px; height: 3px;
              background: var(--color-terracotta);"></div>
</div>
```

Or with the reusable `.has-terracotta-tick` utility (add to global.css if
missing).

**Budget: maximum 2-3 uses per long page.** Overuse defeats the point.
Good candidates: transitioning into the Vogue press panel, major page
transitions on `/fellowship`, the boundary between narrative sections
and CTA sections on `/how-you-can-help`.

## 4. Button variants

All buttons share base padding, min-height, font-family (Newsreader), and
transition. Variants change only fill/border/text.

| Variant | Fill | Border | Text | Hover |
| --- | --- | --- | --- | --- |
| **Primary** | `bg-ink` | none | `text-stone` | `bg-ink-soft` |
| **White** | `bg-stone` | `1px ink` | `text-ink` | invert to primary |
| **Outline** | transparent | `1px ink` | `text-ink` | invert to primary |
| **Ghost** | none | none | `text-ink underline` | underline brightens |

Never use `shadow-md` (flat design). Focus-visible outlines use
`outline: 2px solid var(--color-ink)` at `outline-offset: -2px` inside
buttons, or `2px terracotta` at `offset: 3px` for hover-ambiguous
elements.

## 5. Component patterns

### Eyebrow kicker

Plain uppercase tracked span. **No leading rule/dash.**

```html
<span class="uppercase text-ink/55" style="font-size: 0.72rem; letter-spacing: 0.2em; line-height: 1;">
  Featured in
</span>
```

If you find the old `.eyebrow` class with a `::before` gold rule
anywhere, remove the rule.

### Cards

- Default: no fill, `border border-ink/15 rounded-md`.
- Emphasis: `bg-stone-2`, no border.
- On dark ink surfaces: `bg-stone/95 border border-white/20` (slight
  translucency softens the brightness on dark bg).

Never add drop shadows.

### Links in body copy

`class="link-underline text-ink underline underline-offset-4 decoration-ink/30 hover:decoration-ink"`.

Hover accents on link underlines may use `decoration-terracotta` if you
want the link to feel more editorial — reserve for feature links only.

### Section eyebrow + heading + dek pattern

```html
<span class="uppercase text-ink/55 mb-5" style="font-size: 0.72rem; letter-spacing: 0.2em;">
  Section label
</span>
<h2 class="font-serif tracking-tightish font-normal text-ink"
    style="font-size: clamp(1.75rem, 3.4vw, 2.6rem); line-height: 1.12;">
  Section heading
</h2>
<p class="mt-4 text-ink/85" style="font-size: 1.05rem; line-height: 1.7;">
  Dek copy.
</p>
```

## 6. Rules for Claude

Read this list before making UI changes.

1. **Never hardcode hex colors.** Use `var(--color-…)` in CSS or
   `bg-…` / `text-…` Tailwind classes.
2. **Match dividers to content shifts.** Same-topic sections get a
   hairline (Tier 1). Bands with different roles get a surface shift
   (Tier 2). Major chapter breaks get the terracotta tick (Tier 3, ≤3
   per page).
3. **Eyebrow kickers are plain.** No `.eyebrow` class with `::before`
   rule. Uppercase tracked span only.
4. **Buttons: pick a variant, never a one-off.** Primary / White /
   Outline / Ghost. No shadows.
5. **Terracotta is precious.** Hairlines, small badges, hover accents,
   chapter ticks. Never large fills, never as a section background,
   never on more than ~5% of a page's real estate.
6. **Cards default to no fill.** If a fill is needed, use `stone-2`
   (equivalent to `paper-warm`, both resolve to `#FAF6E3`).
7. **Trailing periods on label-style headings are off** ("Credo",
   "Elements", "Mission" — not "Credo."). Full-sentence headings keep
   their punctuation.
8. **Photos:** clean rectangles, no rounded corners on hero/feature
   photos, no card chrome. Small photos may have `border-radius: 2-4px`
   at most.

## 7. Migration checklist (for the current codebase)

If updating the tokens site-wide, do these in order:

1. Update `src/styles/global.css` `@theme` block:
   - Add `--color-stone`, `--color-stone-2`, `--color-terracotta`.
   - Keep `--color-paper` / `--color-paper-warm` as aliases initially
     so existing pages don't break: point them at the new hexes.
2. Update `body` background to `bg-stone`.
3. Sweep for `bg-paper-warm` — replace with `bg-stone-2` (or remove if
   the section should now be plain stone).
4. Remove the gold `::before` rule from `.eyebrow` in `global.css`.
5. Remove any remaining `.has-gold-tick` usage — replace with the
   terracotta tick pattern in Tier 3 above, applied sparingly.
6. Sweep buttons for `bg-paper`, `paper-warm` usage — align with the
   four button variants above.
7. Verify the site visually at both mobile and desktop.
