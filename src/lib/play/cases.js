import "server-only";
import { CaseSchema, publicBrief } from "./schema";
const w = (id, name, role, text) => ({ id, name, role, text });
const f = (id, label, description, weight = 1, color = false) => ({
  id,
  label,
  description,
  weight,
  color,
});
export const CASES = [
  {
    version: 2,
    id: "moth",
    title: "The midnight light theft",
    name: "Marlow Moth",
    subjectKind: "creature",
    drawingMode: "color",
    reaction: "“I thought it was a bring-your-own-lamp party.”",
    witnesses: [
      w(
        "pip",
        "Pip",
        "Bicycle courier",
        "A walking pear. Green, fluffy, tiny feet. Cut right across the bike lane. No visible wings. Terrible road manners.",
      ),
      w(
        "otis",
        "Otis",
        "Amateur birdwatcher",
        "Two long antennae, each with an orange pom-pom. Huge cream-colored eyes with dark pupils. A little smile beneath them.",
      ),
      w(
        "bea",
        "Bea",
        "Café proprietor",
        "A red bow tie! On all that green fluff. Dressed for dinner, apparently. Then ate the lightbulb.",
      ),
    ],
    features: [
      f(
        "outline",
        "Pear-shaped body",
        "Broad pear-shaped fluffy body, narrower at top, two tiny feet, no visible wings",
        3,
      ),
      f(
        "antennae",
        "Pom-pom antennae",
        "Two long curved antennae with round pom-pom tips",
        3,
      ),
      f(
        "eyes",
        "Enormous eyes",
        "Two very large cream oval eyes with dark pupils",
        2,
      ),
      f(
        "bow",
        "Little bow tie",
        "Small red bow tie below little smiling mouth",
        2,
      ),
      f(
        "palette",
        "Green + orange",
        "Green body, orange antenna tips and red bow tie",
        1,
        true,
      ),
    ],
  },
  {
    version: 2,
    id: "maven",
    title: "The vanishing velvet rope",
    name: "Vera Vantage",
    subjectKind: "human",
    drawingMode: "color",
    reaction: "“If I’m not on the list, the list is wrong.”",
    witnesses: [
      w(
        "bea",
        "Bea",
        "Café proprietor",
        "A long, angular face and an enormous white swoop of hair. All piled high on one side. Like whipped cream with an appointment.",
      ),
      w(
        "pip",
        "Pip",
        "Bicycle courier",
        "Huge round blue glasses. Warm brown skin. Pointed chin, long narrow neck. Looked very pleased with herself.",
      ),
      w(
        "otis",
        "Otis",
        "Amateur birdwatcher",
        "One big gold hoop earring, on your left as you look at her. Red-orange turtleneck. Arched dark brows and a knowing smile.",
      ),
    ],
    features: [
      f(
        "outline",
        "Angular face",
        "Long angular face, pointed chin and narrow neck",
        2,
      ),
      f("hair", "White swoop", "Large high asymmetrical swept white quiff", 3),
      f("glasses", "Round glasses", "Oversized round blue glasses", 3),
      f("earring", "Gold hoop", "One large hoop earring on viewer left", 1),
      f("expression", "Knowing smile", "Arched dark brows and amused smile", 1),
      f(
        "palette",
        "Bold colors",
        "Warm brown skin, white hair, cobalt glasses, orange-red turtleneck",
        1,
        true,
      ),
    ],
  },
  {
    version: 2,
    id: "teapot",
    title: "A very steep getaway",
    name: "Earl Greybeard",
    subjectKind: "object",
    drawingMode: "color",
    reaction: "“I demand to speak to my infuser.”",
    witnesses: [
      w(
        "otis",
        "Otis",
        "Amateur birdwatcher",
        "Round orange body. A curved spout on your left; a big loop handle on your right. Definitely not a bird. I checked twice.",
      ),
      w(
        "bea",
        "Bea",
        "Café proprietor",
        "Two tiny dark eyes and a magnificent navy mustache. Curled out at the ends. The audacity of having better facial hair than my husband.",
      ),
      w(
        "pip",
        "Pip",
        "Bicycle courier",
        "Dark blue lid, little knob on top, two blue boots underneath. Short legs. Surprisingly fast for something full of tea.",
      ),
    ],
    features: [
      f("body", "Round teapot", "Squat round teapot body", 2),
      f(
        "outline",
        "Spout + handle",
        "Curved spout on viewer left and large loop handle on viewer right",
        3,
      ),
      f(
        "mustache",
        "Magnificent mustache",
        "Thick dark blue curved mustache beneath two small dark eyes",
        3,
      ),
      f("lid", "Lid + knob", "Dark blue lid with round knob", 1),
      f("boots", "Two boots", "Two short legs in dark blue boots", 1),
      f(
        "palette",
        "Orange + blue",
        "Orange body, dark blue lid, mustache and boots",
        1,
        true,
      ),
    ],
  },
].map((c) => CaseSchema.parse(c));
export function chooseCase(index = 0, mode = "practice", now = new Date()) {
  const n =
    mode === "daily"
      ? Math.floor(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) /
            86400000,
        )
      : index;
  return CASES[((n % CASES.length) + CASES.length) % CASES.length];
}
export function curatedBrief(index = 0, mode = "practice") {
  return {
    ...publicBrief(chooseCase(index, mode)),
    source: "curated",
    mode,
    scoreAvailable: false,
  };
}
