# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are members of the New York Philosophy Club who attend local events and want to continue conversations afterward. The wider community includes members of chapters in other cities or institutions and online-only participants who may never attend an in-person event.

## Product Purpose

The product helps people discover philosophy events, find participants with shared interests, and sustain meaningful relationships and discussions beyond a single gathering. Success means an event leads naturally to people, and those connections lead naturally to further conversation.

## Positioning

This is a community hub organized around the club's real events, chapters, members, and philosophical interests. It connects in-person and online participation in one experience rather than functioning as a generic message board.

## Operating Context

Members browse upcoming and past events, join location-based or online chapters, opt into an attendee directory, explore profiles, participate in event discussions, and contact other members. Organizers use the existing administration and moderation capabilities to manage chapters, events, attendance, and safety.

## Capabilities and Constraints

- The existing web application supports chapters, chapter membership, events, attendance, member profiles, an opt-in directory, discussions, direct messages, notifications, blocking, reporting, and moderation.
- The showcase centers on Home, Events, Event Detail, People, Member Profile, and Chapters.
- The original forum remains a top-level experience with Popular/Newest sorting and topic filters.
- Luma is the current source of truth for event registration and contact records. A future integration should match registrations to accounts, preserve opt-in profile visibility, and distinguish registration from confirmed attendance.
- Direct messages are supported today. The product direction also includes event group chats and chapter group chats; those group types are showcased in the front end but require future backend implementation.
- Following people, personalized recommendations, and richer event discovery may use local demo state until corresponding backend capabilities are approved.
- The first deliverable is a local, responsive showcase. It is not pushed or deployed until the user reviews it.
- Payment, identity verification, email delivery, and a new moderation dashboard are outside the showcase scope.

## Brand Commitments

Preserve the New York Philosophy Club name and existing amphora logo. Refine the presentation into a polished, warm contemporary salon using the existing editorial identity as the starting point. The voice should feel thoughtful, inclusive, curious, safe, and welcoming rather than academic or institutional.

## Evidence on Hand

- Existing amphora logo and icon in `apps/web/public/`.
- Existing stone, navy, and terracotta design tokens in `apps/web/src/app/globals.css`.
- Existing application routes and API support for most showcase functionality.
- No approved member photography, testimonials, or quantitative impact claims are available; the showcase must not fabricate endorsements or performance claims.

## Product Principles

- Make events the beginning of community, not the end of an evening.
- Help members find people through shared context: attendance, chapter, location, and interests.
- Keep participation global by default, with locations and chapters as useful layers.
- Treat privacy, consent, and moderation as core product behavior.
- Favor a small number of complete, understandable journeys over a wide collection of disconnected features.

## Accessibility & Inclusion

The experience must work responsively on desktop and mobile, use clear language, preserve keyboard access and visible focus, maintain readable contrast, and keep attendance and directory visibility opt-in.
