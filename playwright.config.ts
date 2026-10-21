import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['**/game.spec.ts', '**/audit.spec.ts'], timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1280, height: 800 }, headless: true,
    screenshot: 'only-on-failure', launchOptions: { executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 }
});
