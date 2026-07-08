# Launch Checklist (Phase 8)

Run through this top to bottom before pointing the domain at production.
Machine-checkable items live in `npm run launch-audit` — run it against the
production env (it reads `.env.local` / `.env`; real env vars win) and get a
clean pass first. Everything else here is a manual gate.

## 1. Automated audit

```
npm run launch-audit
```

Covers: env completeness (Supabase, Anthropic, Turnstile pair, site URL),
RLS re-verification with the anon key (base tables sealed, `suspects_public`
never exposes `image_path`), live pool counts vs targets (40 rookie /
40 detective / 20 cold_case), 30 days of dailies assigned, and the
`JUDGE_DAILY_BUDGET` circuit breaker.

Also run the deeper Phase 1 policy suite against prod once:
`npm run test:rls`.

## 2. Test suites green

- [ ] `npm run lint` — clean.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm test` — Vitest: scoring weights, rate-limit logic, migration logic.
- [ ] `npm run test:e2e` — Playwright smoke: core loop (start → draw →
      submit → results, suspect image never requested pre-submit) and
      daily-uniqueness. Self-contained (mock backend); needs no live keys.
- [ ] `npm run calibrate-judge` — re-run whenever `JUDGE_PROMPT_VERSION`
      changed; blank canvas must score < 10.

## 3. Rate limits sanity-tested in prod

The Vitest suite proves the logic; prod proves the wiring. With prod deployed
(from a throwaway network/identity):

- [ ] 11th sketch submission inside an hour returns 429 `rate_limited`.
- [ ] Round creation past 30/hour returns 429.
- [ ] Second daily attempt same identity returns 409 `daily_already_played`.
- [ ] `JUDGE_DAILY_BUDGET` set low on a preview deployment flips submissions
      to 503 `precinct_closed` (then restore).

## 4. Abuse & cost controls armed

- [ ] `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set in prod —
      the server log must NOT show the "verification SKIPPED" warning.
- [ ] `JUDGE_DAILY_BUDGET` set to a deliberate number (default 300).
- [ ] `JUDGE_MODEL` pinned if you don't want the code default.

## 5. Content queued

- [ ] Pool at launch targets (audit checks counts; eyeball a few in
      `npm run review-suspects` for quality).
- [ ] 30 dailies assigned (`npm run assign-daily`), cron scheduled for
      refills (GitHub Action or equivalent).

## 6. Observability on

- [ ] Vercel Analytics enabled for the project (events flow: `round_started`,
      `round_submitted`, `signup`, `share_clicked`).
- [ ] Structured logs visible in the Vercel log drain — every API request
      emits `api_request` with route/status/ms; judge calls emit
      `judge_scored` with token counts and `estimated_cost_usd`.

## 7. Meta & domain

- [ ] `NEXT_PUBLIC_SITE_URL=https://drawandorder.app` (or final domain) set —
      OG cards, sitemap, and robots all derive from it.
- [ ] Custom domain attached in Vercel, HTTPS live.
- [ ] `/robots.txt` and `/sitemap.xml` respond on prod.
- [ ] Share a finished round in iMessage/Slack/Twitter — OG card renders.

## 8. Final eyeball

- [ ] Full anonymous loop on a phone over cellular: consent notice → practice
      round → daily round → results → share.
- [ ] Sign up mid-history, confirm rounds + streak migrate (and the anon id
      can't be claimed twice).
- [ ] Reduced-motion (OS setting) results page renders settled, no animation.
- [ ] Lighthouse a11y ≥ 95 on `/`, `/draw`, `/results/[id]`.

## Reference — verified during Phase 8

- Palette contrast: every text/background token pair in use passes WCAG AA
  (≥ 4.5:1); the tightest is `ink-faint` on `manila-300` at 5.01:1. The
  kraft-on-manila trap called out in the build plan is not used for text.
- Konva loads only on the draw page (dynamic import, `ssr: false`); the
  results replay uses a plain 2D canvas.
- Fonts are subset (`latin`) via `next/font`; typewriter face loads with
  automatic `font-display: swap`.
