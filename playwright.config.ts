import { defineConfig } from "@playwright/test";

// Runs against the production build (`npm run build` first).
// In CI (pages.yml): no retries, so a flaky test fails the deploy instead of
// hiding; an HTML report (+ traces of failures) for the uploaded artifact.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: ci ? "retain-on-failure" : "off" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
