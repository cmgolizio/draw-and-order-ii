import { describe, it, expect } from "vitest";
import { initialRound, roundReducer } from "../../src/lib/play/round-state";
import { CASES, curatedBrief, chooseCase } from "../../src/lib/play/cases";
import { computeCaseScore } from "../../src/lib/play/schema";
import {
  serializeStrokeLog,
  parseStrokeLog,
  decompressStrokeLog,
} from "../../src/lib/draw/strokeLog";
import { POST as reveal } from "../../src/app/api/play/reveal/route";
describe("playful round integrity", () => {
  it("allows only a finished round to reveal, and preserves errors for retry", () => {
    expect(roundReducer(initialRound, { type: "reveal" })).toEqual(
      initialRound,
    );
    const frozen = roundReducer(initialRound, { type: "finish" });
    const busy = roundReducer(frozen, { type: "submit" });
    expect(roundReducer(busy, { type: "clue", index: 2 })).toEqual(busy);
    const failed = roundReducer(busy, {
      type: "error",
      message: "budget spent",
    });
    expect(failed.phase).toBe("finishing");
    expect(failed.result).toBeNull();
    expect(roundReducer(failed, { type: "edit" }).phase).toBe("drawing");
  });
  it("keeps identities, art, rubric and reactions out of the initial brief", () => {
    const serialized = JSON.stringify(curatedBrief());
    for (const field of [
      "Marlow",
      "features",
      "reaction",
      "image",
      "path",
      "data:",
    ])
      expect(serialized).not.toContain(field);
    expect(curatedBrief().witnesses).toHaveLength(3);
  });
  it("rotates practice and fixes daily to UTC", () => {
    expect(chooseCase(1).id).not.toBe(chooseCase(0).id);
    expect(chooseCase(0, "daily", new Date("2026-09-28T00:00Z")).id).toBe(
      chooseCase(99, "daily", new Date("2026-09-28T23:59Z")).id,
    );
  });
  it("never fabricates missing/invalid judgments and excludes color in monochrome", () => {
    const f = CASES[0].features;
    expect(() =>
      computeCaseScore(f, { traits: {}, feedback: "No" }, "color"),
    ).toThrow();
    expect(() =>
      computeCaseScore(
        f,
        {
          traits: Object.fromEntries(f.map((f) => [f.id, NaN])),
          feedback: "No",
        },
        "color",
      ),
    ).toThrow();
    const traits = Object.fromEntries(
      f.filter((f) => !f.color).map((f) => [f.id, 60]),
    );
    expect(
      computeCaseScore(
        f,
        { traits, feedback: "Actual valid judge response" },
        "monochrome",
      ).score,
    ).toBe(60);
  });
  it("round-trips color and old grayscale replay logs", () => {
    const s = {
      id: 1,
      tool: "pencil",
      grade: "6B",
      size: 10,
      simulatePressure: true,
      startedAt: 0,
      points: [[10, 20, 0.5, 0]],
      color: "#319979",
    };
    const parsed = parseStrokeLog(JSON.parse(serializeStrokeLog([s])));
    expect(decompressStrokeLog(parsed)[0].color).toBe(s.color);
    delete s.color;
    expect(
      decompressStrokeLog(
        parseStrokeLog(JSON.parse(serializeStrokeLog([s]))),
      )[0].color,
    ).toBeUndefined();
  });
  it("rejects unfinished/cross-origin reveals and returns a real image with null score", async () => {
    expect(
      (
        await reveal(
          new Request("http://localhost/api/play/reveal", {
            method: "POST",
            body: JSON.stringify({ id: "moth" }),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await reveal(
          new Request("http://localhost/api/play/reveal", {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    const res = await reveal(
      new Request("http://localhost/api/play/reveal", {
        method: "POST",
        body: JSON.stringify({ id: "moth", finished: true }),
      }),
    );
    const body = await res.json();
    expect(body.score).toBeNull();
    expect(body.suspectImageUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
