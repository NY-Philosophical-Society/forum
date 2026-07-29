# Membership design — decisions of 2026-07-29

Owner decisions from the freemium discussion. This supersedes the
supporter-gated-reading model in `docs/prompts/04-access-chapters.md` Part 1.

## Principle

**Gate creation and member spaces, never reading.** The forum is top-of-funnel
for donations, not a reward for them. Too few users is the failure mode to
avoid; the public feed and archive stay free and indexable.

## Tiers

| Tier | Gets |
| --- | --- |
| Anonymous | Feed + teasers (unchanged) |
| Free account | Read everything (unchanged) |
| ID-verified | Post, reply, like, DM (unchanged) |
| **Member** (donor — `isSupporter`) | Member perks below |

WISDOMKEY remains the member unlock until the donation/subscription API exists.

## Decided perks (build these)

1. **Event afterlife threads** — every event, automatic. One thread per event:
   collects questions before, receives topics/recording/transcript after,
   attendees get a "was there" marker, conversation continues with the people
   who were in the room. Posting member-only; reading open.
2. **Member directory** — **opt-in**, member-only. Photo, name, chapter,
   interests. The scarce good is finding the other serious people.
3. **Reading partner / study group matching** — opt-in flag + interests filter
   on the directory; members connect by DM.
4. **Chapters** — member-only sub-forums (from the original brief 04 Part 2).

## Candidate perks (not yet decided)

- Event recording archive (companion to afterlife threads)
- Monthly members-only online symposium — serves non-NYC members
- Speaker/topic nomination and voting on the season's programme
- Mentorship pairing (same machinery as reading-partner matching)
- Annual print anthology of the year's best threads
- Monthly digest newsletter ("what the forum argued about")
- 7-day member-first window on new threads (strong incentive, mild growth cost
  — parked, revisit if membership conversion is weak)

## Rejected

- **Supporter-gated reading** (old brief 04 Part 1) — inverts the funnel;
  everyone currently in the DB would have lost read access on ship day.
- Donor-only thread-starting — parked; a new member with a good question is
  exactly who we want to keep.
- DMs behind donation — private conversation is how community forms.

## Implementation

Runnable brief at `~/cron/prompts/08-brief-04.md` (chapters, directory,
matching, event threads — in that order, server-side enforcement, tests per
gate). Runs after the Postgres conversion completes.
