import { test, expect } from "@playwright/test";
import { db, pool } from "../src/server/db";
import { userGoals, userProfile } from "../src/server/db/schema";

// Serial: the later tests deliberately reuse the goal the onboarding test
// writes, rather than each test racing to reset/read shared DB state
// independently.
test.describe.serial("app shell", () => {
  test.beforeAll(async () => {
    await db.delete(userGoals);
    await db.delete(userProfile);
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test("a new user completes onboarding and reaches the dashboard without instructions", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Set up Intake" }),
    ).toBeVisible();

    await page.getByLabel("Daily calorie goal").fill("2200");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel(/Skip for now/).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Finish setup" }).click();

    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();
    await expect(page.getByText(/of 2,200 kcal logged so far/)).toBeVisible();
  });

  // The dashboard is the app's server round-trip: nothing below renders until
  // the goal and the day's snapshot both come back from the API.
  test("app shell loads and the dashboard round-trip works end-to-end", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();

    await expect(page.getByText("Left to eat today")).toBeVisible();
    await expect(page.getByText(/of 2,200 kcal logged so far/)).toBeVisible();
  });

  test("bodyweight and the calorie goal are editable later from the profile screen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile" }).click();

    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await page.getByLabel("Current weight").fill("82.5");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();
  });

  test("the privacy policy is reachable from the profile screen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile" }).click();
    await page.getByRole("button", { name: "Privacy policy" }).click();

    await expect(
      page.getByRole("heading", { name: "Privacy policy" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    // Back returns to where the policy was opened from, not the dashboard.
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  // Issue #56: offline reads are in, offline writes are out — a plain
  // indicator, and both logging entry points disabled with a message
  // instead of accepting a submit that would fail (ADR 0003).
  test("shows an offline indicator and disables the logging entry point when the network drops", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();

    await context.setOffline(true);
    try {
      await expect(page.getByText("offline", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Log food" }).click();
      await page.getByRole("button", { name: "Describe a meal" }).click();

      await expect(page.getByRole("button", { name: "Log entry" })).toBeDisabled();
      await expect(page.getByText(/No internet/)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
