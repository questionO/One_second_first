import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testMatch: '**/soak.spec.ts', timeout: 660000, outputDir: 'soak-results', reporter: 'list' });
