import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 smoke: the core loop (start round → draw → submit → results) and
 * daily-uniqueness, against the mock backend. Each test gets a fresh browser
 * context, so each gets a fresh anonymous identity.
 */

/**
 * First visit shows the one-time consent notice (fictional faces +
 * privacy) as a modal — acknowledge it so the page underneath is clickable.
 */
async function acknowledgeConsent(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: /every face here is fictional/i,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: /understood — open the files/i })
    .click();
  await expect(dialog).not.toBeVisible();
}

/**
 * Clicks the open-case button until the app reacts. The first click can land
 * before hydration attaches handlers; retrying is the Playwright-sanctioned
 * cure.
 */
async function openCase(page: Page, buttonName: string | RegExp) {
  await expect(async () => {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(
      page.getByRole("button", { name: buttonName }),
    ).not.toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}

/** Draws a couple of strokes on the sketch canvas with the mouse. */
async function drawSomething(page: Page) {
  const canvas = page.getByRole("img", { name: /sketch canvas/i });
  await expect(canvas).toBeVisible();
  // Konva mounts client-side (dynamic import) — wait for the real surface.
  await expect(canvas.locator("canvas").first()).toBeVisible();

  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A long face outline-ish stroke and a nose-ish stroke.
  await page.mouse.move(cx - 60, cy - 120);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(cx - 60 + i * 10, cy - 120 + Math.sin(i) * 30);
  }
  await page.mouse.up();

  await page.mouse.move(cx, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx - 8, cy);
  await page.mouse.move(cx + 6, cy + 30);
  await page.mouse.up();
}

/** Submit is double-tap-to-confirm: "Submit sketch" then "File it?". */
async function submitSketch(page: Page) {
  await page.getByRole("button", { name: "Submit sketch" }).click();
  await page.getByRole("button", { name: "File it?" }).click();
}

async function expectResultsPage(page: Page) {
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole("heading", { name: "Forensic report" }),
  ).toBeVisible();
  // The score stamp comes from our scoring code, fed by the mocked judge.
  await expect(page.getByText(/\/ 100/)).toBeVisible();
  // The judge's case report and the forensic checklist both render.
  await expect(page.getByText(/survive a lineup/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trait analysis" }),
  ).toBeVisible();
}

test("core loop: open a practice case, draw, submit, read the report", async ({
  page,
}) => {
  // The suspect image must never travel before submission (reveal = submit).
  const preSubmitLeaks: string[] = [];
  let submitted = false;
  page.on("request", (request) => {
    if (!submitted && request.url().includes("suspect-images")) {
      preSubmitLeaks.push(request.url());
    }
  });

  await page.goto("/draw");
  await acknowledgeConsent(page);
  await openCase(page, "Open case");

  // The briefing (witness statement) arrives from the round API.
  await expect(page.getByText(/crooked — bent left/)).toBeVisible();

  await drawSomething(page);
  submitted = true;
  await submitSketch(page);

  await expectResultsPage(page);
  expect(preSubmitLeaks).toEqual([]);

  // Post-reveal the suspect portrait DOES load, via a signed URL.
  await expect(
    page.getByAltText("The suspect's portrait, revealed"),
  ).toBeVisible();
});

test("daily uniqueness: one attempt per identity per day", async ({ page }) => {
  await page.goto("/daily");
  await acknowledgeConsent(page);
  await openCase(page, "Open today's case");

  await drawSomething(page);
  await submitSketch(page);
  await expectResultsPage(page);

  // Same identity, same day, second attempt: the server must refuse.
  await page.goto("/daily");
  await openCase(page, "Open today's case");

  await expect(page.getByText("Sketch filed")).toBeVisible();
  await expect(
    // The copy uses a typographic apostrophe in "today's".
    page.getByText(/already filed a sketch on today.s case/),
  ).toBeVisible();
  const reportLink = page.getByRole("link", { name: "Read your case report" });
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveAttribute(
    "href",
    /\/results\/[0-9a-f-]{36}/,
  );
});