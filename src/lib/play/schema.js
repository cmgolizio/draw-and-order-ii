import { z } from "zod";
export const WitnessSchema = z.object({
  id: z.enum(["pip", "otis", "bea", "archive"]),
  name: z.string().min(1).max(60),
  role: z.string().max(80),
  text: z.string().min(1).max(650),
});
export const FeatureSchema = z.object({
  id: z.string().regex(/^[a-zA-Z]+$/),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  weight: z.number().positive().max(5),
  color: z.boolean().default(false),
});
export const CaseSchema = z
  .object({
    version: z.literal(2),
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().max(100),
    name: z.string().max(100),
    subjectKind: z.enum(["human", "creature", "object"]),
    drawingMode: z.enum(["color", "monochrome"]),
    reaction: z.string().max(240),
    witnesses: z.array(WitnessSchema).min(1).max(5),
    features: z.array(FeatureSchema).min(3).max(10),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.features.map((f) => f.id)).size !== v.features.length)
      ctx.addIssue({ code: "custom", message: "Feature ids must be unique" });
  });
export function publicBrief(c) {
  return {
    id: c.id,
    title: c.title,
    drawingMode: c.drawingMode,
    witnesses: c.witnesses,
  };
}
export function computeCaseScore(features, verdict, mode) {
  const active = features.filter((f) => mode !== "monochrome" || !f.color);
  const schema = z.object({
    traits: z.record(z.string(), z.number().min(0).max(100)),
    feedback: z.string().min(1).max(600),
  });
  const parsed = schema.parse(verdict);
  if (
    Object.keys(parsed.traits).length !== active.length ||
    active.some((f) => !Object.hasOwn(parsed.traits, f.id))
  )
    throw new Error("Judge feature mismatch");
  const score = Math.round(
    active.reduce((n, f) => n + parsed.traits[f.id] * f.weight, 0) /
      active.reduce((n, f) => n + f.weight, 0),
  );
  return {
    score,
    features: active.map((f) => ({
      id: f.id,
      label: f.label,
      score: parsed.traits[f.id],
    })),
    feedback: parsed.feedback,
  };
}
