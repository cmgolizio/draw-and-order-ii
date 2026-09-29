import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const canvas = (page) =>
  page.getByRole("img", { name: "Sketch canvas — draw the suspect here" });
async function draw(page) {
  await page.locator(".konvajs-content canvas").first().waitFor();
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65, {
    steps: 20,
  });
  await page.mouse.up();
}
test("desktop full round, tools, reveal protection, export and next case", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The midnight light theft." }),
  ).toBeVisible();
  await expect(page.getByText("Pip", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerHTML()).not.toContain("Marlow Moth");
  expect((await request.get("/content/cases/moth.png")).status()).toBe(404);
  expect((await request.get("/api/play/reveal")).status()).toBe(405);
  await draw(page);
  await expect(page.getByRole("button", { name: "Undo stroke" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo stroke" }).click();
  await expect(page.getByRole("button", { name: "Redo stroke" })).toBeEnabled();
  await page.getByRole("button", { name: "Redo stroke" }).click();
  await page.getByRole("button", { name: "Green ink", exact: true }).click();
  await draw(page);
  await page.getByRole("button", { name: "Next witness" }).click();
  await page.getByRole("button", { name: "Next witness" }).click();
  await expect(
    page.getByRole("heading", { name: "Bea", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Read clue 1 from Pip" }).click();
  await expect(
    page.getByRole("heading", { name: "Pip", exact: true }),
  ).toBeVisible();
  await mkdir("test-results/redesign", { recursive: true });
  await page.screenshot({
    path: "test-results/redesign/desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done with my sketch" }).click();
  await page.getByRole("button", { name: "Meet the suspect" }).click();
  await expect(
    page.getByRole("heading", { name: "Marlow Moth" }),
  ).toBeVisible();
  await expect(
    page.getByText("Unscored · just for the fun of it"),
  ).toBeVisible();
  const src = await page
    .getByRole("img", { name: "Your finished drawing" })
    .getAttribute("src");
  const info = await sharp(Buffer.from(src.split(",")[1], "base64")).metadata();
  expect([info.width, info.height]).toEqual([800, 1040]);
  await page.screenshot({
    path: "test-results/redesign/reveal.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next odd case" }).click();
  await expect(
    page.getByRole("heading", { name: "The vanishing velvet rope." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("phone touch, pen, resize, clear, reduced motion, complete loop", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3200/");
  await page.locator(".konvajs-content canvas").first().waitFor();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const box = await canvas(page).boundingBox();
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 50, y: box.y + 50 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.x + 100, y: box.y + 150 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByRole("button", { name: "Undo stroke" })).toBeEnabled();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await canvas(page).dispatchEvent("pointerdown", {
    pointerType: "pen",
    pointerId: 8,
    pressure: 0.8,
    clientX: box.x + 90,
    clientY: box.y + 90,
    bubbles: true,
  });
  await canvas(page).dispatchEvent("pointermove", {
    pointerType: "pen",
    pointerId: 8,
    pressure: 0.6,
    clientX: box.x + 150,
    clientY: box.y + 160,
    bubbles: true,
  });
  await canvas(page).dispatchEvent("pointerup", {
    pointerType: "pen",
    pointerId: 8,
    pressure: 0,
    bubbles: true,
  });
  const doneBox = await page.getByRole("button", {name:"Done with my sketch"}).boundingBox();
  expect(doneBox.y + doneBox.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: "test-results/redesign/phone.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("button", { name: "Undo stroke" })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear it?" })).toBeVisible();
  await page.getByRole("button", { name: "Clear it?" }).click();
  await expect(
    page.getByRole("button", { name: "Undo stroke" }),
  ).toBeDisabled();
  await draw(page);
  await page.getByRole("button", { name: "Done with my sketch" }).click();
  await page.getByRole("button", { name: "Meet the suspect" }).click();
  await expect(
    page.getByRole("heading", { name: "Marlow Moth" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/redesign/phone-reveal.png",
    fullPage: true,
  });
  await context.close();
});
test("missing backend leaves practice playable; reveal failure preserves sketch", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page);
  await page.getByText("More", { exact: false }).first().click();
  await page.getByRole("button", { name: "Open a scored case" }).click();
  await expect(
    page.getByText("Your current case is still playable."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo stroke" })).toBeEnabled();
  await page.route("**/api/play/reveal", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporarily unavailable." }),
    }),
  );
  await page.getByRole("button", { name: "Done with my sketch" }).click();
  await page.getByRole("button", { name: "Meet the suspect" }).click();
  await expect(page.locator(".submission-error")).toContainText(
    "Your sketch is still here.",
  );
  await page.getByRole("button", { name: "Back to my sketch" }).click();
  await expect(page.getByRole("button", { name: "Undo stroke" })).toBeEnabled();
});
test("judge failure, budget exhaustion and blocked verification have unscored exits", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/rounds", (r) =>
    r.fulfill({
      json: {
        roundId: "11111111-2222-4333-8444-555566667777",
        mode: "practice",
        difficulty: "detective",
        statement: "Round head. Large eyes. Small mouth.",
        statementTeaser: "Test case",
      },
    }),
  );
  await page.getByText("More", { exact: false }).first().click();
  await page.getByRole("button", { name: "Open a scored case" }).click();
  await draw(page);
  await page.getByRole("button", { name: "Done with my sketch" }).click();
  for (const [code, error] of [
    ["turnstile_failed", "Human verification unavailable."],
    ["precinct_closed", "Daily judge budget spent."],
    ["judge_unavailable", "The judge is unavailable."],
  ]) {
    await page.route("**/submit", (r) =>
      r.fulfill({ status: 503, json: { code, error } }),
    );
    await page
      .getByRole("button", { name: /Get AI likeness|Retry AI judging/ })
      .click();
    await expect(page.locator(".submission-error")).toContainText(error);
    await expect(
      page.getByRole("button", { name: "Reveal without a score" }),
    ).toBeEnabled();
  }
  await page.route("**/api/rounds/*/reveal", (r) =>
    r.fulfill({ json: { forfeited: true, suspectImageUrl: null } }),
  );
  await page.getByRole("button", { name: "Reveal without a score" }).click();
  await expect(
    page.getByText("Unscored · just for the fun of it"),
  ).toBeVisible();
});
test("daily uses the same complete core flow", async ({ page }) => {
  await page.goto("/daily");
  await expect(page.getByText("TODAY’S ODD LITTLE CRIME")).toBeVisible();
  await draw(page);
  await page.getByRole("button", { name: "Done with my sketch" }).click();
  await page.getByRole("button", { name: "Meet the suspect" }).click();
  await expect(
    page.getByRole("button", { name: "Sketch today’s case again" }),
  ).toBeVisible();
});
