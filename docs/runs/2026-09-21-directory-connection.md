# Directory adapter — local verification

- Scope: isolated `codex/production-foundation` branch only. No main-branch
  changes, hosted database reads/writes, deployment, or push.
- Connection: signed-in Society members use the existing opt-in directory and
  chapter APIs. Search and reading-partner filters are server-side; responses
  are runtime-validated. Nonmembers see a member-only boundary. Profile,
  settings, messages, notifications, and search links use the existing forum
  screens instead of showing mock showcase state.
- Client checks: TypeScript type-check and 71/71 client tests passed locally on
  2026-09-21; focused adapter tests cover encoded filters, authorization header,
  pagination offset, membership denial, malformed response rejection, and
  pending chapter state. The original
  shared suite passed 16/16 before the directory adapter was added.
- The optimized production build compiled and generated all routes locally.
  Build success does not verify deployment secrets or live provider access.
- The original API suite passed 176/176 checks on the isolated local stack.
  Two earlier attempts were correctly recorded as **blocked** while Docker or
  the sandbox's local signing-key setup was unavailable. A temporary read-only
  link to the existing local signing key enabled the run; it was removed after
  verification. The original checkout and hosted Supabase records were not
  modified. The API tests use a disposable local Postgres database; their
  synthetic local Auth users are not automatically removed by that suite.
- The new three-account directory HTTP journey passed 11/11 checks against
  the local app, local Auth, and local Postgres. It verified nonmember denial,
  default privacy, opt-in, read-after-write search, the partner filter, and
  opt-out. Exact synthetic public-account and Auth-user cleanup passed.
  Reviewed evidence: `.verification/2026-09-21T18-47-52-615Z-directory-http-7bdec053/`.
- Not yet established: authenticated showcase browser journey, keyboard/mobile
  review, second-account isolation at the interface, hosted provider
  configuration, and deployability.
- Known limitations: real profiles use the original forum page rather than
  showcase styling; authenticated home and events are explicitly labeled
  previews. Real Google sign-in and the placeholder membership-code replacement
  remain launch blockers.

## Reproducible evidence set

The final local source fingerprint is
`4ddca6869fccd079468bfbc0866e367c3baca2feb5646505b4c74955334b2650`.
All five records below refer to that same executable-source snapshot:

- Client: `.verification/2026-09-21T18-48-14-004Z-client-cde374e4/`
- Shared: `.verification/2026-09-21T18-48-14-004Z-shared-5f221d43/`
- Original API: `.verification/2026-09-21T18-48-18-196Z-api-5a5cfae0/`
- Forum HTTP: `.verification/2026-09-21T18-48-05-157Z-forum-http-5c70278c/`
- Directory HTTP: `.verification/2026-09-21T18-47-52-615Z-directory-http-7bdec053/`

Together: 71 client, 16 shared, and 176 API tests; 11 forum and 11 directory
HTTP checks. These are local service results, not hosted or interactive-browser
verification. Raw payloads and secrets are not saved in these records.
