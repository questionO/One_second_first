import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testMatch: '**/release.spec.ts', outputDir: 'release-results', use:{ ...base.use, baseURL:'http://127.0.0.1:5174' }, webServer:{ command:'npm run preview -- --port 5174', url:'http://127.0.0.1:5174', reuseExistingServer:false } });
