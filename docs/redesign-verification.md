# Redesign release notes and verification

## What is shipped in source
- Existing II history preserved, no third repository and no live data changes.
- Instant curated practice with three original references, authored witnesses, colors, graphite, preserved freehand engine, redo, guarded clear, fixed exports, replay, unscored comparison, next case.
- Daily shares the same core UI. The instant daily is explicitly an unranked rotating warm-up. The existing ranked daily is available from More -> Open ranked daily; its server-side one-attempt rule is retained.
- Online legacy cases use an honest three-part transcript of the original witness, not fabricated independent witnesses.
- Versioned nonhuman case rubric and judge path. All numeric scores come from validated judge responses. CASE_JUDGE_CALIBRATED=true must only be set after running/reviewing the calibration suite. Until then new cases reveal without a score.
- Historical results keep their original rubric and score; v2 results get a separate feature breakdown.
- No changes to RLS/storage permissions. No pool retirement, deletion, migrations or paid generation pipeline runs.

## Operational requirements
1. Deploy this branch as a preview in the EXISTING Vercel project, preserving environment configuration. The three server-only reference PNGs are included with outputFileTracingIncludes; verify their presence in the function artifact.
2. Existing Supabase URL, publishable key, secret key, Anthropic key and JUDGE_MODEL must be valid. The connected Supabase account lists only a different project, not Draw & Order; no matching credentials are available here, so production Supabase status cannot be diagnosed. Production currently returns Human check missing on creation.
3. Configure both Turnstile site and secret keys with the correct deployment domains. It now gates AI submission, not starting to draw. Failure preserves the sketch and offers unscored reveal. Do not remove rate limits/spend caps.
4. To add reviewed originals to the real pool, dry-run `node --conditions=react-server --import tsx scripts/publish-curated.mjs`. `--publish` inserts only new deterministic IDs as status=review and private images; existing rows are untouched. Review there, then approve using existing review tooling and assign dailies using existing assignment tooling. This session does not publish content to production.
5. Calibrate before enabling CASE_JUDGE_CALIBRATED. Supply a JSON array with caseId, kind, file, min, max for each of moth/maven/teapot and blank/scribble/wrong/rough-finger/rough-mouse/good/monochrome. Use actual human finger/mouse drawings, not converted photos. Run `node --conditions=react-server --import tsx scripts/calibrate-curated.mjs --manifest=PATH` first; `--run` explicitly makes the paid calls. Review report and repeat a small fixed subset to quantify variance. Blanks/scribbles <10; rough recognizable drawings must beat polished wrong subjects. Do not call this calibrated until it passes.
6. No new paid service or recurring generation job. Curated rounds make zero AI calls. Online submissions retain current budget/rate controls; new judge requests cap output at 2000 tokens with zero automatic retries. Exact dollar cost depends on the configured provider/model; verify current pricing before calibration. This session made no paid API calibration calls.

## Limits to verify on real devices/services
- Simulated pointer pressure does not validate physical Apple Pencil palm rejection or iOS Safari. Test these on actual devices.
- Curated rounds require the Next server for reveal, but no Supabase or AI. They are not airplane-mode rounds. Local sketches are tab-local; save a PNG before leaving. Online failed judging keeps a server copy as well as the current tab.
- A new case deliberately replaces the old sketch. The More menu explains this before opening.
- Existing anonymous identity uses a browser UUID as a bearer credential; unchanged here. Revealed historical links remain share capabilities. The privacy notice now accurately discloses this.
- The repository's pre-existing missing pipeline helper exports prevented builds and 10 Q&A tests; repaired.
- Dependency drift selected react-konva 19.3 with a React ^19.3 peer. Pinned the already intended 19.2.5 and committed the previously missing lockfile.
- No Vercel production deployment is performed by this implementation task; review the branch preview before promotion.

## Checks completed during implementation
- `npm test`: 98 passing unit tests (including case state transitions, no premature reveal data, null-score fallback, malformed judgments, color/legacy replay compatibility).
- `npm run build`: successful Next production build and TypeScript check.
- `playwright.redesign.config.mjs`: five production-browser scenarios pass (desktop round/tools/export/reveal/next, phone touch + simulated pen + resize + clear + reduced motion, missing backend, judge/budget/verification failures, daily flow). Failure responses in the judge scenario are deliberately mocked; they do not measure model quality.
- Existing `playwright.config.ts`: three updated tests pass against a simulated Supabase/Anthropic server; actual server routes enforce ownership, sealed results, duplicate submission and daily uniqueness, render historical results, and preserve an unscored uploaded sketch.
- Private reference file trace inspected: all three PNGs included only in server output.
- Offline content publish script dry-run validates all three reviewed image hashes. No live content writes.
- Visual screenshots inspected for desktop, phone and reveal. Phone-specific sizing refined after first screenshot showed excess scrolling.
