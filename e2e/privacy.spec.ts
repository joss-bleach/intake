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
  await expect(page.getByText("Joss is the data controller")).toBeVisible();
  await expect(page.getByRole("link", { name: "joss@bleach.digital" }).first()).toHaveAttribute(
    "href",
    "mailto:joss@bleach.digital",
  );

  await page.getByRole("button", { name: "Back" }).click();

  await expect(
    page.getByRole("heading", { name: "Sign in to Intake" }),
  ).toBeVisible();
});
