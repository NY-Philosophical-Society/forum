# Showcase mock-storage cleanup — local verification

- Scope: isolated `codex/production-foundation` worktree only. No commit, push,
  Vercel deployment, original-main edit, or hosted Supabase read/write.
- Change: the showcase no longer hydrates or persists mock accounts/activity in
  localStorage. On the updated app's next load it removes exactly its four
  prior showcase keys. Supabase Auth and unrelated origin storage are excluded.
- Test: focused storage test asserts the exact deleted keys and preserved
  Supabase/unrelated keys. TypeScript type-check passed; client suite passed
  66/66 tests locally on 2026-09-21. Neither proves browser migration until
  the updated page is loaded in a review browser.
- Remaining mock state: demo-mode fixtures and authenticated views other than
  the forum still simulate some interactions in session memory. Do not call
  those views integrated or deploy the branch as production-ready.
- Open release gates: chapter HTTP/browser journey, all remaining views, real
  Google consent, hosted configuration, and replacement of the original
  shared placeholder membership code.
