/**
 * The two fake suspects required by Phase 1 acceptance: one `live`, one
 * `review`, so the RLS test can prove non-live suspects stay invisible.
 * Fixed ids so re-running the seed upserts instead of duplicating.
 *
 * Both carry a hand-written qa_bank (polish v2 Phase 3) assembled through
 * buildQaBank, so the fixtures share the pipeline's fixed question list and
 * the RLS test can prove qa_bank flows through suspects_public.
 */
import { buildQaBank } from "../pipeline/qa";

export const SEED_SUSPECTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    difficulty: "rookie",
    statement:
      "I got a good look at him, officer. Round face, really round, like a dinner plate. Mid-30s. Buzzed dark hair, almost shaved. Thick straight eyebrows that nearly met in the middle. Small ears, flat nose — wide at the bottom. Clean-shaven, I'm sure of that. There was a small scar cutting through his left eyebrow, and he had this permanent squint, like he'd walked out of a dark room.",
    statement_teaser:
      "Round-faced man, mid-30s, buzzed hair, scar through the left eyebrow.",
    traits: {
      sex: "male",
      age: "mid-30s",
      build: "stocky",
      faceShape: "round",
      hair: "dark buzz cut",
      facialHair: "clean-shaven",
      eyebrows: "thick, straight, nearly meeting",
      eyes: "narrow",
      nose: "flat, wide base",
      mouth: "small and tight",
      distinguishingMarks: [{ mark: "small scar", placement: "left eyebrow" }],
      expression: "squinting",
      complexion: "ruddy",
      accessories: [],
    },
    qa_bank: buildQaBank({
      age: "Mid-thirties, I'd say. No older than forty, I'm sure of that.",
      build: "Stocky. Solid through the shoulders, like a guy who hauls kegs.",
      hair: "Dark, buzzed down almost to the scalp.",
      faceShape: "Round. Really round, like a dinner plate — I keep saying it because it's true.",
      eyes: "Narrow. He was squinting the whole time, but they were narrow to begin with.",
      nose: "Flat, with a wide base. Took up half his face.",
      mouth: "Small and tight, like he was holding a coin between his lips.",
      marks: "A small scar cutting right through his left eyebrow. You couldn't miss it.",
    }),
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
      sex: "male",
      age: "mid-40s",
      build: "lean",
      faceShape: "oblong",
      hair: "swept back, graying temples",
      facialHair: "mustache",
      eyebrows: "sparse, arched",
      eyes: "deep-set",
      nose: "crooked, old break to the left",
      mouth: "thin-lipped",
      distinguishingMarks: [],
      expression: "flat",
      complexion: "pale",
      accessories: [],
    },
    qa_bank: buildQaBank({
      age: "Mid-forties, maybe. Somewhere in there.",
      build: "Lean. Wiry, even. He didn't take up much of the sidewalk.",
      hair: "Swept back, going gray at the sides. The temples, mostly.",
      faceShape: "Long. An oblong sort of face, if that's a word you can put in a report.",
      eyes: "Deep-set. Shadowed, under that streetlight.",
      nose: "Crooked — bent once to the left, like an old break. That part I'm sure of.",
      mouth: "Thin-lipped, I think. Hard to say.",
      marks: "None that I saw. But it was dark, understand.",
    }),
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