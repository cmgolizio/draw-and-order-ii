# Classic-style gameplay branch

## Direction (September 30, 2026)

Base: `main` at `b6b3ec1`. Work exclusively on `redesign/classic-gameplay`.
The separate `redesign/playful-rounds` branch and PR are untouched.

Keep the existing manila/kraft palette, Special Elite labels, Geist body type,
folder tabs, stamps, grain, paperclip, header/navigation and historical result
pages. Reuse `CaseFolder` and the existing canvas. Gameplay changes must fit
these elements; no new brand, rounded cartoon interface, or new font system.
The newer request restores the original case-file visual direction. The earlier
prompt still supersedes grayscale-only play, a mandatory difficulty selector,
and long single-statement rounds. Security and honest-scoring rules stand.

## Reusable work and remaining gaps

The first alternative already has a tested Konva/freehand engine, original
reviewed human/creature/object references, three witnesses, server-only image
reveal, optional paid judging, fallback rounds, replay and private upload fixes.
Reuse those functions without copying its visual design. Main's Q&A pipeline is
partially implemented, but the live question UI and Cadet tier remain plans.
Existing human portraits and historical scores remain readable. No pool wipe or
schema change is necessary: v2 content uses existing JSON columns additively.
The connected Supabase account currently exposes only What's in House, so live
Draw & Order database/storage and paid-judge verification remain blocked.

## Round and page contract

`drawing -> finishing -> judging -> suspense -> revealed -> next drawing`.
A submission failure returns to finishing with the sketch intact. Editing is
possible before reveal. Suspense is skippable and reduced-motion aware.
Home and Practice open directly into the first reviewed case. Daily uses the
same drawing/reveal component and a stable UTC case; ranked Daily and the
leaderboard are secondary when the backend is available. Account/history keep
their original pages. One unobtrusive expandable privacy explanation replaces
the entry-blocking notice; AI submission still has an explicit disclosure.

## Layout and tools

Desktop: familiar folder, slim left tool rail, central clipped portrait paper,
right witness evidence card and finishing action. Mobile: short witness card
above the paper, left tool rail, compact color/size row and visible Done action.
A fixed 800x1040 export is independent of responsive display dimensions. Clue
numbers revisit earlier testimony. Draw/erase/undo/redo/guarded clear are always
labelled; color is optional per case; graphite remains available. No silhouette
from the reference is delivered. Paper-sketch upload is deferred to preserve
instant play; no reliable secondary upload flow currently exists in II.

## Content and scoring

Use the same three reviewed original cases: Marlow Moth, Vera Vantage and Earl
Greybeard. Witnesses are shown as small monochrome evidence portraits to fit
the existing style. Their text, canonical features and reference art agree.
Curated fallback reveals return `score: null` with feature comparisons. A number
only comes from a validated vision response through the existing protected,
budget-capped submission route. New v2 numerical judging stays disabled until
rough-finger/mouse/blank/unrelated/color/monochrome calibration is completed.
Older scored rounds retain their original score data and AI-estimate wording.

## Verification gates

Build and unit suite; desktop and phone full rounds; touch/pen/mouse/resize;
no pre-reveal images; fixed export; keyboard and controls; reveal/retry failures;
blocked human check, judge failure, exhausted budget; historical result and
ownership tests. Compare screenshots to main's visual system. Create a separate
GitHub PR and Vercel preview. No production promotion without final review.
