-- Draw & Order — Polish v2 Phase 3: precomputed witness Q&A bank.
--
--   * qa_bank is produced by the offline pipeline (scripts/pipeline/qa.ts)
--     and stored per suspect: an array of { trait, question, answer }. The
--     question set is a fixed list, identical across suspects; only the
--     answers vary. The live app never generates answers (locked decision).
--   * Questions and answers are safe to serve, so the column joins the
--     suspects_public security-barrier view. image_path stays out of the
--     view — that invariant does not change.

alter table public.suspects
  add column qa_bank jsonb;

comment on column public.suspects.qa_bank is
  'Precomputed witness Q&A: [{ trait, question, answer }]. Generated offline, '
  'never live. Questions identical across suspects, answers suspect-specific. '
  'Client-safe (exposed via suspects_public); null until the pipeline fills it.';

-- CREATE OR REPLACE VIEW may only append columns, and qa_bank appends last —
-- exactly what we need. Ownership and the existing anon/authenticated SELECT
-- grants carry over; security_barrier is restated so the replace cannot
-- silently drop it.
create or replace view public.suspects_public
  with (security_barrier = true) as
  select
    id,
    difficulty,
    statement,
    statement_teaser,
    silhouette_path,
    qa_bank
  from public.suspects
  where status = 'live';