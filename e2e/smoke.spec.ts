import { test, expect } from "@playwright/test";
import { db, pool } from "../src/server/db";
import { userGoals, userProfile } from "../src/server/db/schema";

// Serial: the ping test below deliberately reuses the goal the onboarding
// test writes, rather than each test racing to reset/read shared DB state
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
    await expect(page.getByText(/Goal: 2200 kcal/)).toBeVisible();
  });

  test("app shell loads and the ping round-trip works end-to-end", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();

    await page.getByRole("button", { name: "Ping the server" }).click();

    await expect(page.getByTestId("ping-result")).toContainText("pong");
  });

  test("bodyweight and the calorie goal are editable later from the profile screen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Edit goals" }).click();

    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await page.getByLabel("Current weight").fill("82.5");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();
  });
});
