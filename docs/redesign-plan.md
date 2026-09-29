# Playful rounds — September 28, 2026

## Audit and superseded decisions
Base: Draw and Order II, branch redesign/playful-rounds. I is reference-only. The newer user brief supersedes grayscale-only, mandatory difficulty selection, folder/noir as the primary interface, human-only references/rubric, silhouette guides, and long single statements.

Reuse: Konva/perfect-freehand pointer engine, fixed 800x1040 exports, stroke replay, anonymous identity, existing owned-round API, private storage, daily uniqueness, results/history routes, spending/rate limits, offline pipeline.
Replace: marketing entry, modal-first onboarding, dense drawing panels, demo download-only dead end, pre-drawing challenge, primary results hierarchy.
Verified plans: sex/persona/Q&A pipeline and qa_bank migration exist; RoundGame does not consume Q&A. Cadet is absent from schema and UI. Do not treat pool regeneration as verified.
Production observation: homepage and practice render; opening case returns 'Human check missing'. No token-producing widget visible. No service credentials available locally, so DB pause, pool health, judge model availability and live budget cannot be asserted.
I contains a hash-based scoring fallback; none of it will be reused. II's rubric is human/grayscale-specific; needs versioned case-specific traits. Existing historical scores retain their original meaning.

## Product decisions
Visual thesis: a cobalt sketch desk, warm white paper, oversized rounded headlines, punchy orange buttons, original gouache witnesses. 'Odd Little Crimes' supplies the humor, never the instructions.
Routes: / and /draw enter the same playable practice desk; /daily uses the same desk with daily selection; /results/[id], /me, /login retained. Ranked daily board is secondary.
State: drawing -> finishing -> judging (optional live) -> suspense -> revealed -> next/drawing. Failed judge returns to finishing with preserved sketch, retry and unscored reveal. No synthetic score. Completion freezes the submission. All clues stay reachable. Reveal is skippable and respects reduced motion.
Mobile: compact brand row, case title, canvas, witness card and tools; essential actions never behind a modal. Desktop: large portrait canvas beside witness interview, tools at left. No suspect-derived guide.
Tools: color-aware Draw, pink Erase, undo/redo, guarded Clear, three sizes, small palette, graphite mode. No fill or uploads in this slice: both add interaction/validation complexity without improving instant play. Existing stroke engine retained, color added compatibly to old logs.
Content: three original reviewed references (a pear-shaped moth, a human with a white quiff, a walking teapot), three distinct witnesses. Case v2 carries subjectKind, drawingMode, witnesses, weighted feature rubric, title/name/reaction. Stored in existing JSON traits; no destructive migration. Review status and image hashes recorded offline. Canonical traits, authored clues and art must agree.
Fallback: bundled SERVER-ONLY curated art and clues; cheap reveal-only endpoint does not store drawings or mint scores. It needs the Next server, not Supabase/AI/Turnstile. This is a service-outage fallback, not a promise of full airplane-mode play. Images are excluded from public assets and initial payloads. Unscored rounds cannot enter ranked daily/history. A reveal POST intentionally ends a local round; its fictional reference is not an authenticated user record.
Live: explicit 'scored case' option retains ranked backend. Move human verification to expensive submission, retaining creation limits. Only reviewed/published v2 cases use new rubric. Legacy cases remain playable with shorter transcript beats, not invented witness testimony. Never silently switch cases after drawing starts.
Judging: per-case weighted recognizable features, no artistic quality bonus, color excluded for monochrome; structured validated response, no difficulty inflation for v2. New scoring is disabled until calibration is explicitly enabled. Blank/scribble and rough finger/mouse calibration required before release. Existing scoring left readable.

## Delivery gates
1. Complete curated round and reveal without credentials.
2. Add three reviewed cases, daily fallback and live API adapter.
3. Check state, no score fabrication, protected images, exports/replay, responsive controls, failures; build and commit.
4. Document live-only gates: provision reviewed content privately, calibrate judge, test real credentials and devices, then deploy via existing Vercel project. Do not overwrite production or migrate data during local verification.
