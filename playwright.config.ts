import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true,
  use: { baseURL: 'http://localhost:5173/kalendarz-oznaczen-/', viewport: { width: 390, height: 844 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: process.env.CI ? {} : { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] } } }],
  webServer: { command: 'npm run build && npm run preview -- --port 5173', url: 'http://localhost:5173/kalendarz-oznaczen-/', reuseExistingServer: !process.env.CI },
});
