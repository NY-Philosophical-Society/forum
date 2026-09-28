---
name: New York Philosophy Club Community
description: A warm contemporary salon for events, people, and continuing conversation.
colors:
  salon-paper: "#f7f3ea"
  salon-paper-deep: "#eee8da"
  salon-white: "#fffdf8"
  civic-ink: "#112b3a"
  civic-ink-soft: "#38505d"
  quiet-text: "#66757b"
  gathering-clay: "#a64f32"
  gathering-clay-dark: "#843a25"
  trust-green: "#2f6655"
  signal-gold: "#c9943d"
typography:
  display:
    fontFamily: "Libre Baskerville, Georgia, serif"
    fontSize: "clamp(2.55rem, 5vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  control: "10px"
  surface: "14px"
  feature: "16px"
  round: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.gathering-clay}"
    textColor: "{colors.salon-white}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.gathering-clay-dark}"
    textColor: "{colors.salon-white}"
  surface-feature:
    backgroundColor: "{colors.civic-ink}"
    textColor: "{colors.salon-white}"
    rounded: "{rounded.feature}"
---

# Design System: New York Philosophy Club Community

## Overview

**Creative North Star: “The Gathering Table”**

The community experience should feel like entering a well-hosted contemporary salon: cultivated, human, and open to a new voice. Events form the center of gravity, while people, chapters, forum topics, and messages gather around them with clear relationships.

The visual system refines the club's existing editorial identity. It uses quiet paper surfaces, civic navy, clay, and deliberate circular motifs without turning philosophy into an academic or institutional costume.

**Key Characteristics:**

- Editorial scale with direct, familiar controls
- Warm paper and strong ink fields
- Circular gathering and member motifs
- Visible privacy and community context
- Responsive structure that becomes a compact bottom navigation on phones

## Colors

The palette combines warm paper with a civic blue-black and a restrained clay action color.

- **Salon Paper** (#f7f3ea): Primary page surface.
- **Deep Paper** (#eee8da): Quiet controls and grouped areas.
- **Civic Ink** (#112b3a): Navigation, featured event fields, and primary text.
- **Gathering Clay** (#a64f32): Primary action and active context.
- **Trust Green** (#2f6655): Privacy, safety, and confirmed community states.
- **Signal Gold** (#c9943d): Small live or upcoming indicators.

**The Clay Rule.** Clay marks action or active context; it does not decorate every surface.

## Typography

- **Display Font:** Libre Baskerville with Georgia fallback
- **Body Font:** Helvetica Neue with Arial fallback

Large serif headings give questions and gatherings cultural weight. The sans-serif layer keeps navigation, metadata, and controls quick to scan. Body copy stays within a readable 65–75 character measure where the layout permits.

## Layout

Desktop pages use a fluid container up to 1360 pixels with broad two-column compositions for event and conversation context. Related lists use hairline separators instead of repeated card shells. Below 760 pixels, content becomes one column and navigation moves to a fixed six-destination bottom bar.

## Elevation & Depth

The system is flat by default. Borders and tonal layering establish hierarchy. Shadows appear only where a real layer floats over content, such as the mobile navigation, notification toast, or the central gathering table.

## Shapes

Feature surfaces use 16-pixel corners, supporting surfaces use 14 pixels, and controls use 10 pixels. Pills are reserved for filters, topics, and compact status. Avatars and gathering diagrams use circles to express people assembled around a shared question.

## Components

### Buttons

Primary buttons use Gathering Clay on Salon White with a 10-pixel radius. Hover deepens the clay and lifts by one pixel. Quiet buttons use a one-pixel border or no container. Every interactive element has a visible focus outline.

### Topic filters

Topic tabs stay text-led. The active topic combines a quiet paper field with a thin clay underline. Compact pill filters are used only for short list controls.

### Lists and surfaces

Forum threads, events, and directory members are separated by hairlines. Large cards are reserved for meaningful grouped experiences such as the featured gathering, chapter introduction, or messaging workspace.

### Navigation

Desktop navigation is a centered text row with a thin clay active indicator. Mobile navigation uses a navy floating bar with a consistent line icon system and compact labels.

## Do's and Don'ts

### Do:

- **Do** make the current gathering or question the visual center of a page.
- **Do** show the shared event, chapter, topic, or interest that explains why two members are connected.
- **Do** keep privacy and visibility language near attendee and directory information.
- **Do** preserve generous separation between major page ideas.

### Don't:

- **Don't** reduce the product to a generic stream of same-sized cards.
- **Don't** expose Luma contact information without a claimed account and explicit visibility choice.
- **Don't** use decorative shadows, gradients, or academic clichés to imply depth or seriousness.
- **Don't** let expressive typography obscure familiar controls or task state.
