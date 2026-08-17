import { test, expect } from "@playwright/test";

// The policy has to be readable before anyone signs in (#99), so this test
// deliberately drops the shared signed-in storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test("a signed-out visitor can read the privacy policy from the sign-in screen", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Sign in to Intake" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Privacy policy" }).click();

  await expect(
    page.getByRole("heading", { name: "Privacy policy" }),
  ).toBeVisible();
  // The contact address repeats in three sections; assert against the one
  // that names the controller, so the check has a subject.
  const controller = page
    .locator("section")
    .filter({ hasText: "Who controls your data" });
  await expect(controller).toContainText("Joss is the data controller");
  await expect(
    controller.getByRole("link", { name: "joss@bleach.digital" }),
  ).toHaveAttribute("href", "mailto:joss@bleach.digital");

  await page.getByRole("button", { name: "Back" }).click();

  await expect(
    page.getByRole("heading", { name: "Sign in to Intake" }),
  ).toBeVisible();
});
