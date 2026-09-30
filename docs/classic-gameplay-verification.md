# Classic-style gameplay: verification and release requirements

## Branch scope

- New branch: `redesign/classic-gameplay`, based on main `b6b3ec1`.
- The first alternative, `redesign/playful-rounds` / PR #1, is untouched.
- `globals.css`, `SiteHeader`, `CaseFolder`, and `InkButton` are unchanged from main.
  Existing manila/kraft colors, font stack, paper grain, tab navigation, stamps,
  account pages and historic reports remain. New gameplay uses those tokens.
- Home/Practice now open into a case immediately. Three authored witnesses give
  short clues with revisit controls. The original drawing engine has color,
  graphite, undo/redo, guarded clear and fixed 800x1040 PNG export.
- The paper, left tools, active clue and Done action coexist at 390x844. Sizes
  live in the left toolbar so the palette needs only one row on the phone.
- A brief skippable suspense beat leads to two evidence sheets, an honest
  unscored label or validated AI estimate, character reaction, feature details,
  replay, PNG download, share text and immediate next case.
- New server-held curated references are the three originals already reviewed
  for the first alternative. Witness portraits use a monochrome treatment to
  match this branch's evidence cards. No live suspect generation is added.
- Daily uses this same core flow. The instant Daily is an unranked shared UTC
  case. Ranked Daily and its board remain secondary options when operational.
- Online cases keep the existing rate limits, spending cap, private storage,
  ownership checks and retry behavior. Human verification happens at the paid
  submission step. Failed requests retain the sketch. Online unscored reveals
  persist the drawing and replay. Completed online rounds update local history.
- Historical human cases use shorter sections of their original testimony;
  these are labelled as one witness, not invented additional witnesses.
- No migrations, pool retirement, production data edits or paid AI calls.

## Checks completed

- `npm test`: 98 unit tests passed (round state, valid scores only, sealed case
  payload, null-score fallback, replay compatibility and existing tests).
- `npm run build`: successful Next.js production build and TypeScript checks.
- `PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium npx playwright test --config=playwright.redesign.config.mjs`:
  6 browser scenarios passed. Desktop full round and next case; phone touch,
  simulated pen, resize, clear and reduced motion; missing backend/reveal retry;
  blocked verification/judge failure/exhausted budget; Daily; scoring-disabled UI.
  Export dimensions and absence of the reference before reveal are checked.
- `PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium npx playwright test --config=playwright.config.ts`:
  3 integration scenarios passed against a simulated Supabase/Anthropic backend.
  Actual app routes enforce ownership, sealed open results, duplicate submission,
  ranked daily uniqueness and persisted unscored drawings. Historical results
  render. These fixtures test plumbing, not the accuracy of an AI judge.
- Content publish dry-run verified all three reviewed image hashes and generated
  deterministic additive IDs. No database writes were made.
- Next's server file trace includes all three private reference images. They
  are not public assets or part of the initial case response.
- Desktop, phone and reveal screenshots visually reviewed; in `classic-previews/`.
- The standalone agent-browser daemon could not start in this sandbox. The
  Playwright browser tests provided the interaction and screenshot verification.

## What still needs the real services

1. Connect the Draw & Order Supabase project. The currently connected account
   lists only What's in House; do not substitute that project. This session
   cannot confirm the Draw & Order project's current operational status.
2. Verify existing Vercel environment settings for Supabase URL/publishable/secret
   keys, Anthropic key, JUDGE_MODEL, and both Turnstile keys/domain settings.
   The curated full-round path works without those services, but needs Next.js
   to serve its reveal; it does not claim airplane-mode support.
3. If adding originals to the online pool, first run:
   `node --conditions=react-server --import tsx scripts/publish-curated.mjs`.
   `--publish` inserts new rows with `status=review` and private images. Existing
   rows and dailies remain untouched. Review/approve and assign using the existing
   tools only once connected. No live content is silently replaced.
4. Keep `CASE_JUDGE_CALIBRATED` unset until real rough-finger, rough-mouse, good,
   blank, scribble, wrong-subject and monochrome drawings have been reviewed.
   Prepare a JSON array of `{caseId, kind, file, min, max}` covering all seven
   kinds for each of moth/maven/teapot. Run the dry-run command:
   `node --conditions=react-server --import tsx scripts/calibrate-curated.mjs --manifest=PATH`.
   `--run` makes the paid calls (21 minimum, no automatic retries). Review current
   configured model pricing before executing. Blanks/scribbles must score below
   10; rough recognizable sketches must beat polished wrong subjects. Repeat a
   small subset to check variance before enabling scores. No such calibration
   has been claimed or performed in this session.
5. Verify physical iPhone/Safari and Apple Pencil input. Automated touch/pen
   events exercise input handling but cannot establish real-device palm rejection.
6. Review the separate Vercel preview before merging or promoting to production.

No new subscription or recurring generation job is introduced. Curated rounds
make zero AI calls. Online judging uses the existing capped server path. Sketches
in curated rounds live in the current tab; PNG download is available. Revealed
online result links remain share capabilities and the privacy notice says so.
