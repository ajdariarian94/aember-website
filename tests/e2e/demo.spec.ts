import { expect, test } from "@playwright/test";

// Against the production build (vite preview): the real xterm.js renders.
test("every page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of ["", "architecture", "features", "hardware", "getting-started"]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the demo plays: console text and a live dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/demo");
  await expect(page.getByRole("tab", { name: "boot" })).toBeVisible();
  const rows = page.locator(".xterm-rows");
  await expect(rows).toContainText("aember", { timeout: 20_000 });
  await expect(page.getByTestId("service-aember-netd")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pid1-rss")).toContainText("MB");

  // another scene, at 4x
  await page.getByRole("tab", { name: "kill-service" }).click();
  await page.locator("select").selectOption("4");
  await expect(page.getByRole("heading", { name: "A service dies and comes back" })).toBeVisible();
  await expect(page.getByTestId("service-aember-echo")).toBeVisible({ timeout: 30_000 });
  // the position moves while playing
  const pos = page.getByTestId("position");
  const first = await pos.textContent();
  await page.waitForTimeout(1500);
  expect(await pos.textContent()).not.toBe(first);
  expect(errors).toEqual([]);
});
