import { defineConfig, devices } from "@playwright/test";
const deployed = process.env.SITE_URL;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: deployed ?? "http://127.0.0.1:4174/opengrid/",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: deployed
    ? undefined
    : {
        command: "node scripts/serve-pages.mjs --port 4174",
        cwd: "../..",
        url: "http://127.0.0.1:4174/opengrid/",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
