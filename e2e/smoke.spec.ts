import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test("online legacy round: owned submission, sealed image, honest result and historical report", async ({
  page,
  request,
}) => {
  const anonId = randomUUID();
  const opened = await request.post("/api/rounds", {
    data: { mode: "practice", anonId, difficulty: "detective" },
  });
  expect(opened.ok()).toBe(true);
  const brief = await opened.json();
  expect(brief.silhouetteUrl).toBeNull();
  expect(JSON.stringify(brief)).not.toContain("image_path");
  const sealed = await request.get(`/results/${brief.roundId}`);
  expect(await sealed.text()).toContain("This case is still open");
  const wrong = await request.post(`/api/rounds/${brief.roundId}/reveal`, {
    data: { anonId: randomUUID() },
  });
  expect(wrong.status()).toBe(403);
  const drawing = await sharp({
    create: { width: 800, height: 1040, channels: 3, background: "#fbf9f4" },
  })
    .png()
    .toBuffer();
  const scored = await request.post(`/api/rounds/${brief.roundId}/submit`, {
    multipart: {
      anonId,
      usedGuide: "false",
      drawing: { name: "sketch.png", mimeType: "image/png", buffer: drawing },
    },
  });
  expect(scored.ok()).toBe(true);
  const result = await scored.json();
  expect(result.score).toBeGreaterThan(0); // Fixture judge response ONLY; not a calibration assertion.
  expect(result.suspectImageUrl).toBeTruthy();
  await page.goto(`/results/${brief.roundId}`);
  await expect(
    page.getByRole("heading", { name: "Your case, closed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trait analysis" }),
  ).toBeVisible();
  const duplicate = await request.post(`/api/rounds/${brief.roundId}/submit`, {
    multipart: {
      anonId,
      drawing: { name: "sketch.png", mimeType: "image/png", buffer: drawing },
    },
  });
  expect(duplicate.status()).toBe(409);
});

test("ranked daily resumes unfinished round and rejects second completed attempt", async ({
  request,
}) => {
  const anonId = randomUUID();
  const data = { mode: "daily", anonId };
  const first = await (await request.post("/api/rounds", { data })).json();
  const resumed = await (await request.post("/api/rounds", { data })).json();
  expect(resumed.roundId).toBe(first.roundId);
  await request.post(`/api/rounds/${first.roundId}/reveal`, {
    data: { anonId },
  });
  const duplicate = await request.post("/api/rounds", { data });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe("daily_already_played");
});

test("unscored reveal saves the PNG and cannot mint a score", async ({
  request,
}) => {
  const anonId = randomUUID();
  const brief = await (
    await request.post("/api/rounds", { data: { mode: "practice", anonId } })
  ).json();
  const drawing = await sharp({
    create: { width: 800, height: 1040, channels: 3, background: "#fbf9f4" },
  })
    .png()
    .toBuffer();
  const response = await request.post(`/api/rounds/${brief.roundId}/reveal`, {
    multipart: {
      anonId,
      drawing: { name: "sketch.png", mimeType: "image/png", buffer: drawing },
    },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.forfeited).toBe(true);
  expect(result.score).toBeUndefined();
  const html = await (await request.get(`/results/${brief.roundId}`)).text();
  expect(html).toContain("The sketch filed for this case");
  expect(html).toContain("Revealed without AI judging.");
});
