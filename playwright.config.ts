import { defineConfig, devices } from "@playwright/test";
const baseURL = "http://127.0.0.1:3300";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm start",
    url: `${baseURL}/health`,
    timeout: 30000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "development",
      VITE_DISABLE_HMR: "1",
      PORT: "3300",
      APP_URL: baseURL,
      LOCAL_DB_PATH: `.local/e2e-${process.pid}`,
      DATABASE_URL: "",
      MP_ACCESS_TOKEN: "",
      MP_MODE: "sandbox",
      RESEND_API_KEY: "",
      META_PIXEL_ID: "",
    },
  },
});
