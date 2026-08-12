import { test, expect } from "@playwright/test";

test("app shell loads and the ping round-trip works end-to-end", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();

  await page.getByRole("button", { name: "Ping the server" }).click();

  await expect(page.getByTestId("ping-result")).toContainText("pong");
});
