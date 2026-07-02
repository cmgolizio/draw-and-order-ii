/**
 * The two fake suspects required by Phase 1 acceptance: one `live`, one
 * `review`, so the RLS test can prove non-live suspects stay invisible.
 * Fixed ids so re-running the seed upserts instead of duplicating.
 */
export const SEED_SUSPECTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    difficulty: "rookie",
    statement:
      "I got a good look at him, officer. Round face, really round, like a dinner plate. Mid-30s. Buzzed dark hair, almost shaved. Thick straight eyebrows that nearly met in the middle. Small ears, flat nose — wide at the bottom. Clean-shaven, I'm sure of that. There was a small scar cutting through his left eyebrow, and he had this permanent squint, like he'd walked out of a dark room.",
    statement_teaser:
      "Round-faced man, mid-30s, buzzed hair, scar through the left eyebrow.",
    traits: {
      age: "mid-30s",
      build: "stocky",
      faceShape: "round",
      hair: "dark buzz cut",
      facialHair: "clean-shaven",
      eyebrows: "thick, straight, nearly meeting",
      nose: "flat, wide base",
      distinguishingMarks: [{ mark: "small scar", placement: "left eyebrow" }],
      expression: "squinting",
      complexion: "ruddy",
      accessories: [],
    },
    image_path: "seed/fake-suspect-001.png",
    silhouette_path: "seed/fake-suspect-001-silhouette.png",
    status: "live",
    model_info: {
      source: "seed-script",
      prompt_version: "0.0.0-fake",
      image_model: "none",
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    difficulty: "detective",
    statement:
      "It was over fast. Maybe mid-40s? Long face. He had a mustache — or heavy stubble, hard to say under the streetlight. Hair swept back, going gray at the sides I think. Deep-set eyes. Honestly the thing I remember is the crooked nose, bent once to the left like an old break.",
    statement_teaser:
      "Long-faced man, maybe mid-40s, swept-back hair, crooked nose.",
    traits: {
      age: "mid-40s",
      build: "lean",
      faceShape: "oblong",
      hair: "swept back, graying temples",
      facialHair: "mustache",
      eyebrows: "sparse, arched",
      nose: "crooked, old break to the left",
      distinguishingMarks: [],
      expression: "flat",
      complexion: "pale",
      accessories: [],
    },
    image_path: "seed/fake-suspect-002.png",
    silhouette_path: "seed/fake-suspect-002-silhouette.png",
    status: "review",
    model_info: {
      source: "seed-script",
      prompt_version: "0.0.0-fake",
      image_model: "none",
    },
  },
] as const;