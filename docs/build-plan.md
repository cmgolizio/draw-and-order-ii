# Draw & Order v2 — Full Rebuild Plan

Ground-up rebuild of the AI police-sketch game. New repo, TypeScript, Next.js App Router, Tailwind v4, Supabase (Postgres + Auth + Storage), Anthropic API for scoring, image generation via offline pipeline. Old repo (`draw-and-order`) is reference-only.

## Locked decisions

- **Description-first generation**: LLM writes the witness statement, image model renders the face FROM it. Difficulty = statement vagueness.
- **Fully offline content pipeline**: script pre-generates suspects into Postgres. Live app never generates.
- **Server-side scoring by `suspect_id`**: client never receives the suspect image until reveal. Single Claude vision judge call with structured rubric.
- **Anonymous-first**: instant play, localStorage history, migrate on signup. Auth = Google OAuth + magic link only. No passwords.
- **Grayscale-only drawing** (authentic sketch feel; no color traits in scoring).
- **react-konva + perfect-freehand** for stroke rendering.
- **Case-file / noir visual identity**: manila folders, evidence stamps, typewriter type, ink textures.
- **v1 game modes**: Practice (difficulty tiers) + Daily Suspect + daily leaderboard. Public gallery deferred (moderation burden).
- **Cost control**: per-IP + per-identity rate limits, daily anonymous round caps, Cloudflare Turnstile on submission.
- **State**: React state + context. Zustand only if canvas state gets hairy (it may — see Phase 3 note).

---

## Phase 0 — Scaffold & Design System

**Objective**: Empty repo → deployable shell with the visual identity established.

Tasks:

1. `create-next-app` with TypeScript, App Router, Tailwind v4, ESLint, `src/` dir, `@/*` alias. Strict TS.
2. Install: `react-konva konva perfect-freehand @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod @vercel/analytics`.
3. Design tokens in CSS custom properties (Tailwind v4 `@theme`):
   - Palette: manila (`#E8DCC4` family), case-file kraft brown, ink black (`#1A1814`), stamp red (`#B03A2E`), approval-stamp blue, graphite grays. Paper-white for the canvas only — the canvas should feel like a clean sheet clipped to a worn folder.
   - Type: a typewriter/mono face for labels, stamps, and metadata (e.g. Special Elite or IBM Plex Mono); a clean grotesk for body. Redacted-bar text treatment as a reusable utility.
   - Texture: subtle paper grain (CSS or tiny tiled asset), stamp components with slight rotation jitter, torn-edge / paperclip / tape motifs as reusable components.
4. Shared UI primitives: `<Stamp>`, `<CaseFolder>`, `<EvidenceTag>`, `<TypewriterHeading>`, `<InkButton>` (pressed states feel like a rubber stamp).
5. Layout shell: header (case-file tab styling), footer. Routes stubbed: `/` `/draw` `/daily` `/results/[roundId]` `/login` `/me`.
6. Supabase project + Vercel project + env wiring (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, image-gen key, `TURNSTILE_SECRET_KEY`).

Acceptance: deploys to Vercel; themed shell renders; Lighthouse a11y ≥ 95 on shell.

---

## Phase 1 — Database Schema & Security

**Objective**: All persistent state modeled correctly up front, since Daily/leaderboard/anonymous decisions affect schema.

Tables (all with RLS enabled):

```
suspects
  id uuid pk
  difficulty text check in ('rookie','detective','cold_case')
  statement text                 -- the witness statement players see
  statement_teaser text          -- 1-line version for cards/lists
  traits jsonb                   -- canonical trait sheet used at generation time
  image_path text                -- PRIVATE bucket path
  silhouette_path text           -- pre-rendered guide overlay (safe to serve)
  status text check in ('draft','review','live','retired') default 'review'
  model_info jsonb               -- prompt version, image model, gen params
  created_at timestamptz

daily_suspects
  date date pk
  suspect_id uuid fk -> suspects
  -- unique(suspect_id): a suspect is daily at most once

profiles
  id uuid pk fk -> auth.users
  handle text unique             -- generated detective-style handle, editable
  created_at timestamptz

rounds
  id uuid pk
  user_id uuid nullable fk -> profiles
  anon_id uuid nullable          -- client-generated, for pre-auth rounds
  suspect_id uuid fk -> suspects
  mode text check in ('practice','daily')
  daily_date date nullable
  drawing_path text              -- private bucket
  stroke_data jsonb nullable     -- compressed stroke log for replay (size-capped)
  final_score numeric
  score_breakdown jsonb          -- trait scores + judge feedback
  duration_seconds int
  revealed boolean default false
  created_at timestamptz
  -- partial unique index: one daily round per (user_id, daily_date)
  -- and per (anon_id, daily_date)
```

Views / RPCs:

- `daily_leaderboard(date)`: top N by final_score for that date, joined to handle (anon rounds shown as "Unknown Detective #xxxx"). SECURITY DEFINER function, not direct table access.
- `user_stats(user_id)`: rounds played, avg score, best score, current daily streak.

Storage buckets — **both private**:

- `suspect-images`: only service role reads. Client gets a short-lived signed URL only at reveal, only via server route that also marks the round `revealed`.
- `drawings`: user reads own via RLS-scoped signed URLs.

RLS policy summary:

- `suspects`: clients can select only `id, difficulty, statement, statement_teaser, silhouette_path` where `status='live'` (use a security-barrier view `suspects_public` so `image_path` is never exposed).
- `rounds`: users select/insert own (`user_id = auth.uid()`); anonymous inserts go through server routes with service role (never trust `anon_id` claims client-side for reads).
- All writes to `suspects`/`daily_suspects` are pipeline/service-role only.

Acceptance: migration files in repo (`supabase/migrations`); a seed script inserts 2 fake suspects; a test proves the client role cannot read `image_path` or non-live suspects.

---

## Phase 2 — Content Pipeline (offline)

**Objective**: A CLI script (`scripts/generate-suspects.ts`, run locally or via GitHub Action cron) that fills the suspect pool. The live app never calls a generation API.

Flow per suspect:

1. **Trait roll**: port the trait tables from v1 (`age, build, hair, facialHair, accessories, expression, complexion` — drop the bandana ALL-CAPS hack; encode "no face coverings" as a hard constraint in the prompt template). Add: face shape, eyebrow character, nose character, distinguishing marks with placement. Store the rolled sheet in `traits`.
2. **Witness statement** (Claude): generate the statement FROM the trait sheet, in a witness voice ("He had this crooked nose, I remember that..."), at a target detail level per difficulty:
   - `rookie`: 8–10 concrete features, precise language.
   - `detective`: 5–6 features, some hedging ("maybe mid-40s").
   - `cold_case`: 3–4 features, vague, one red-herring-ish subjective remark.
     Also generate `statement_teaser`. Enforce completeness — no truncation (v1 ships truncated descriptions in prod due to `max_tokens: 200`).
3. **Image generation**: render the face from the trait sheet + statement (trait sheet is the source of truth; statement is flavor). Head-and-shoulders, neutral background, consistent framing. Evaluate `gpt-image-1` vs Flux (fal.ai/Replicate) on cost + consistency during this phase; abstract behind a `generateImage(prompt)` adapter so the provider is swappable.
4. **Consistency check** (Claude vision): compare rendered image against the trait sheet; score fidelity 0–100. Below threshold → regenerate image (max 2 retries) or mark `draft`.
5. **Silhouette pre-render**: port v1's brightness-threshold silhouette, but run it in the pipeline (sharp) and save to `silhouette_path`. Client never needs the real image to show the guide — closes a v1 leak where the silhouette was built client-side from the actual suspect image.
6. Upload image + silhouette to private bucket, insert row as `status='review'`.
7. **Review CLI**: `scripts/review-suspects.ts` prints image + statement pairs, approve/reject from terminal (or a dead-simple local admin page). Approve → `live`.
8. **Daily assignment**: `scripts/assign-daily.ts` fills `daily_suspects` for the next N days from unused `detective`-difficulty suspects. Run via cron.

Pool targets for launch: ~40 rookie / 40 detective / 20 cold_case + 30 days of dailies assigned.

Acceptance: one command generates a batch end-to-end; costs logged per suspect; prompt templates versioned in `model_info`.

---

## Phase 3 — Canvas & Drawing Experience

**Objective**: The best-feeling browser sketch surface we can build. This is the product.

1. **Stroke engine**: pointer events → point buffer (x, y, pressure, t). Feed through `perfect-freehand` `getStroke()` with tuned options (`size` from brush setting, `thinning`, `smoothing`, `streamline`, real pressure when `pointerType === 'pen'`, simulated from velocity otherwise). Render as filled `Konva.Path` (convert outline points to SVG path data). Result: tapered, pressure-sensitive, hand-drawn-feeling lines.
2. **Grayscale toolkit** (replaces color picker):
   - Pencil values: 5-step value swatch (10%, 30%, 50%, 70%, 90% black) styled as pencil grades (2H, HB, 2B, 4B, 6B).
   - Brush sizes: fine / medium / broad presets + slider.
   - Eraser: `destination-out`, its own size.
   - Optional v1.1: smudge tool (deferred; note in backlog).
3. **Canvas mechanics**:
   - Fixed logical size 800×1040 (matches suspect portrait aspect), scaled responsively via Stage `scale` — the exported drawing is always the same resolution regardless of device. (v1 exported at whatever the viewport was, so mobile drawings scored against different framing.)
   - Undo/redo as a stroke stack (port v1 logic, add `Cmd/Ctrl+Z`, `Shift+Cmd+Z`, and two-finger-tap undo on touch).
   - Clear with confirm.
   - Palm rejection: ignore touch events while a pen pointer is active.
   - `touch-action: none`, no scroll bleed, works in landscape.
4. **Stroke log**: append-only compressed stroke record (for replay feature, Phase 7). Cap at ~200KB; degrade gracefully by dropping the log, never the drawing.
5. **Silhouette guide**: toggleable overlay rendered from `silhouette_path` at ~25% opacity. Using it flags the round (`score_breakdown.used_guide = true`) and applies a small score multiplier penalty (e.g. ×0.95) — assist, not free lunch.
6. **State note**: canvas state (strokes, tool, history, replay buffer) lives in a `useReducer` or, if prop-drilling gets ugly across toolbar/canvas/mobile-panels, a single small Zustand store scoped to the draw page. Decide during implementation; don't fight it.
7. **Mobile layout**: port the v1 FAB pattern (it's good) — floating action buttons for Tools / Case File / Guide, expand-on-first-tap behavior, panels as bottom sheets rather than full overlays so the canvas stays partially visible.

Acceptance: drawing feels dramatically better than v1 side-by-side; Apple Pencil pressure works; identical export resolution across devices; 60fps strokes on a mid-range phone.

---

## Phase 4 — Game Loop & Server-Side Scoring

**Objective**: The round lifecycle, cheat-proof and cost-capped.

**Round lifecycle** (server routes / route handlers, all validated with zod):

1. `POST /api/rounds` — body: `{ mode, difficulty?, anonId?, turnstileToken }`. Server picks a random live suspect (or the daily), creates a `rounds` row, returns `{ roundId, statement, silhouetteUrl }`. **No image URL. Ever.**
2. `POST /api/rounds/[id]/submit` — multipart: drawing PNG (+ optional stroke log). Server: validates ownership (user or anonId match), uploads drawing to private bucket, fetches suspect image via service role, runs the judge, stores score, returns full results **plus a signed suspect-image URL** (submission = reveal; the round is over).
3. `POST /api/rounds/[id]/reveal` — give-up path: marks round revealed + forfeited (score null), returns signed image URL. Forfeits don't hit the leaderboard.

**Judge (single Claude vision call)**:

- Model: Sonnet-class (cheap, plenty for this). Both images + the trait sheet in one request.
- System prompt: forensic sketch evaluator. Judge _likeness_, not artistic skill — a crude drawing that nails the crooked nose and heavy brow must outscore a beautiful drawing of the wrong face. Explicitly instruct not to penalize line quality.
- Structured output (tool-use / JSON schema):

```json
{
  "traits": {
    "faceShape": 0-100, "proportions": 0-100, "hairStyle": 0-100,
    "eyebrows": 0-100, "eyes": 0-100, "nose": 0-100,
    "mouth": 0-100, "distinctiveMarks": 0-100
  },
  "caseReport": "2-4 sentences, written as a dry detective reviewing the sketch",
  "bestFeature": "trait key",
  "biggestMiss": "trait key"
}
```

- Final score computed **in our code** from weights (config constant, tunable): marks and hair weighted up (most identifying), mouth slightly down. Difficulty multiplier: rookie ×1.0, detective ×1.05, cold_case ×1.15. Guide penalty ×0.95.
- **Failure handling**: if the judge call fails, return an honest error and let the player retry scoring (round stays open). **Never** return a fake score. (v1's deterministic-hash fallback silently presented random numbers as real scores — the single worst behavior in the old app; do not port it.)
- Calibration task: score a fixed set of ~10 reference drawings (good/bad/blank/scribble) whenever the judge prompt changes; blank canvas must score < 10, keep results in `scripts/calibration/`.

**Abuse & cost control**:

- Turnstile verified server-side on round creation.
- Rate limits (Upstash Redis or Postgres-based sliding window): per-IP and per-identity — e.g. 10 submissions/hour, 30/day anonymous; 60/day authed. Friendly in-theme error ("The precinct's sketch budget is spent for today, detective.").
- Max upload 2MB, PNG only, dimensions validated server-side.
- Per-day global spend circuit breaker (env-configurable count of judge calls/day) that flips the app to a "precinct closed" state instead of burning money.

Acceptance: network tab never shows the suspect image pre-submit; duplicate daily submissions rejected; rate limits demonstrably fire; blank canvas scores near zero.

---

## Phase 5 — Identity: Anonymous-First + Auth

**Objective**: Zero-friction play, durable progress for those who want it.

1. **Anonymous identity**: on first visit generate `anonId` (uuid) + a detective handle ("Det. #4821") in localStorage. All rounds work with it. Local round history mirrors server rows.
2. **Auth**: Supabase Auth, Google OAuth + email magic link only. Login page styled as a precinct sign-in sheet.
3. **Migration on signup**: server route `POST /api/migrate-anon` — claims all rounds with the presented `anonId` (one-time: after claiming, the anonId is burned server-side so it can't be replayed to claim into a second account). Daily-uniqueness conflicts resolved by keeping the higher score.
4. **Profile page (`/me`)**: case-file dossier styling — stats (rounds, avg, best, daily streak), round history list with thumbnails, handle editing (profanity-filtered), sign out.
5. Nudge to sign up only after a good moment (post-score with a decent result: "Save this to your record, detective?") — never a wall.

Acceptance: full play loop with zero auth; signup migrates history including daily streak continuity; anonId cannot be double-claimed.

---

## Phase 6 — Daily Suspect & Leaderboard

**Objective**: The retention loop.

1. `/daily` page: today's case, styled as an APB bulletin — date stamp, "CASE #YYYYMMDD". One attempt per identity per day. Countdown to next case after playing.
2. Daily leaderboard: top 20 for today + player's own rank, from the `daily_leaderboard` RPC. Tabs: Today / Yesterday. Handles only — no avatars, no links (no moderation surface).
3. **Streaks**: consecutive daily participation tracked in `user_stats`. Displayed as a stamp collection on the profile.
4. **Shareable result** (Wordle-style): copyable text block —
   `Draw & Order — Case #20260702 🕵️ 78/100 · Best: nose · Miss: hairline · drawandorder.app`
   plus a generated share-card image (Phase 7).
5. Timezone: dailies flip at a fixed UTC hour; display local countdown.

Acceptance: one-attempt enforcement server-side; leaderboard paginates; streak survives anon→auth migration.

---

## Phase 7 — Pages, Results & Signature Features

**Objective**: Everything the player sees outside the canvas, plus the portfolio-flare features.

1. **Landing page** — rebuilt honest (v1's fake testimonial, fake leaderboard numbers, fake community gallery, and dead `/play` link all go away):
   - Hero: case-folder motif, one real statement + real (blurred) suspect thumbnail from the live pool, "Open Today's Case" + "Practice" CTAs.
   - How-it-works: 3 steps as evidence photos pinned to a corkboard.
   - Live daily leaderboard snippet (real data) once populated.
2. **Results page (`/results/[roundId]`)** — the payoff moment, worth real design effort:
   - Side-by-side reveal: suspect photo vs. player sketch, presented as pinned evidence. Animated reveal (folder opens / paper slides out).
   - Score stamped on with a rubber-stamp animation + thud.
   - Trait breakdown as a forensic checklist; `caseReport` text in typewriter type.
   - **Stroke replay**: if a stroke log exists, a "replay sketch" button animates the drawing start-to-finish. High portfolio value, cheap to build off the stroke log.
   - Share card: server-generated OG image (`next/og`) — suspect + sketch side by side, score stamp, case number. Doubles as the social share image.
3. **Consent notice**: port v1's "fictional faces, entertainment only" acknowledgment — one-time modal, remembered in localStorage, linked in footer. Add a short real privacy note (what's stored, that drawings are private).
4. **404 / error pages**: "Case file missing" theming.
5. Sound (optional, muted by default): pencil scratch on stroke, stamp thud on score. Respect `prefers-reduced-motion` for all reveal animations.

Acceptance: results page is screenshot-worthy; OG cards render correctly in iMessage/Twitter/Slack unfurls; reduced-motion path fully works.

---

## Phase 8 — Hardening & Launch

1. **Testing**: Vitest for scoring weights, rate-limit logic, migration logic; Playwright smoke for the core loop (start round → draw → submit → results) and daily-uniqueness.
2. **Observability**: Vercel Analytics (page + custom events: round_started, round_submitted, signup, share_clicked); structured logs on all API routes; judge cost logging per call.
3. **A11y pass**: keyboard-operable toolbar, ARIA on canvas controls, contrast check on manila palette (kraft-brown on manila is a contrast trap — verify every text/bg pair).
4. **Perf**: dynamic-import Konva (client-only), image `sizes` attrs, font subsetting for the typewriter face.
5. **SEO/meta**: per-page metadata, OG defaults, sitemap, robots.
6. Launch checklist: env audit, RLS re-verification against anon key, rate limits sanity-tested in prod, 30 dailies queued, spend circuit-breaker armed, custom domain.

---

## Deferred backlog (schema-compatible, post-v1)

- Public gallery of best daily sketches (needs moderation; `revealed` + opt-in flag already supported by schema).
- Weekly/all-time leaderboards (trivial views over `rounds`).
- Timed "hot pursuit" mode (`duration_seconds` already captured).
- Smudge/blend tool.
- Multiplayer same-suspect head-to-head (Rummisphere Socket.IO experience applies).
- Composite mode: build the face from witness Q&A instead of a static statement.

## Suggested build order & sizing

Phases are sequential except: Phase 2 (pipeline) can run parallel to Phase 3 (canvas) once Phase 1's schema lands. Rough sizing with Claude Code in the loop: P0–P1 a day; P2 two days (prompt tuning is the time sink); P3 two to three days (feel-tuning); P4 two days; P5–P6 two days; P7 two to three days; P8 one day. ~2 weeks of focused part-time work.
