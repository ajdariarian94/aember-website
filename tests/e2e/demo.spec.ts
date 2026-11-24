import { expect, test } from "@playwright/test";

// Against the production build (vite preview): the real xterm.js renders.
// The Install page asks GitHub's API for the latest release: answered here.
const RELEASE = {
  tag_name: "v9.9.9",
  html_url: "https://github.com/ajdariarian94/aember/releases/tag/v9.9.9",
  assets: [
    { name: "aember-rpi4-v9.9.9.img.xz", browser_download_url: "https://example.invalid/rpi.img.xz", size: 150e6 },
    { name: "aember-x64-usb-v9.9.9.img.xz", browser_download_url: "https://example.invalid/usb.img.xz", size: 160e6 },
    { name: "aember-rpi-imager.json", browser_download_url: "https://example.invalid/imager.json", size: 900 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RELEASE) }),
  );
});

test("every page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of ["", "architecture", "features", "hardware", "getting-started", "install", "configure"]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the demo plays: console text and the screen video in step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/demo");
  await expect(page.getByRole("tab", { name: "boot" })).toBeVisible();
  const rows = page.locator(".xterm-rows");
  await expect(rows).toContainText("aember", { timeout: 20_000 });
  const video = page.getByTestId("screen").locator("video");
  await expect(video.locator("source").first()).toHaveAttribute("src", "recordings/boot.webm");
  await expect(video).not.toHaveClass(/off/, { timeout: 30_000 });
  // the player moves the video to the frame: it loaded and seeks
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 })
    .toBeGreaterThan(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true); // never plays by itself

  // another scene, at 4x
  await page.getByRole("tab", { name: "kill-service" }).click();
  await page.locator("select").selectOption("4");
  await expect(page.getByRole("heading", { name: "A service dies and comes back" })).toBeVisible();
  await expect(video.locator("source").first()).toHaveAttribute("src", "recordings/kill-service.webm");
  // the position moves while playing
  const pos = page.getByTestId("position");
  const first = await pos.textContent();
  await page.waitForTimeout(1500);
  expect(await pos.textContent()).not.toBe(first);
  expect(errors).toEqual([]);
});

test("install: Imager list, Etcher downloads, developer commands", async ({ page }) => {
  await page.goto("/#/install");
  await expect(page.getByTestId("release-status")).toContainText("v9.9.9");
  await expect(page.getByTestId("download-rpi")).toHaveAttribute("href", "https://example.invalid/rpi.img.xz");
  await expect(page.getByTestId("download-usb")).toHaveAttribute("href", "https://example.invalid/usb.img.xz");
  await expect(page.getByText("rpi-imager --repo https://github.com/")).toBeVisible();
  await expect(page.getByText("UEFI mode with Secure Boot off")).toBeVisible();
  // fits a phone: no horizontal page scroll
  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("configure: choices change the generated files", async ({ page }) => {
  await page.goto("/#/configure");
  await expect(page.getByRole("note")).toContainText("Preview");
  const services = page.getByTestId("services-json");
  await expect(services).toContainText('"aember-netd"');
  await page.getByRole("checkbox", { name: /^aember-containerd/ }).uncheck();
  await expect(page.getByTestId("no-containers")).toBeVisible();
  await expect(services).not.toContainText("aember-containerd");
  await page.getByLabel("Watchdog seconds").fill("0");
  await expect(page.getByText("aember.watchdog=0")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download services.json" }).click();
  expect((await download).suggestedFilename()).toBe("services.json");
});

test("every page fits a phone: no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["", "architecture", "features", "hardware", "getting-started", "install", "configure", "demo"]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path || "home").toBeLessThanOrEqual(0);
  }
});
