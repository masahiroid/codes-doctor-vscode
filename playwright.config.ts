import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: false,
  use: {
    headless: true,
    launchOptions: { executablePath: process.env.CODE_DOCTOR_BROWSER_EXECUTABLE },
  },
});
