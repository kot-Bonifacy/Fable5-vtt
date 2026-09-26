import { defineConfig } from '@playwright/test';
import { BASE_URL } from './instance/paths.ts';

/**
 * Suita E2E przed betą (`testy.md`). Jedna instancja i jeden stan, więc jeden
 * pracownik; aktorzy (MG, Marek, Ola) mają własne przeglądarki z `fixtures/actors.ts`,
 * dlatego projekt jest jeden — silnik wybiera aktor, nie projekt.
 */
export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  // Tury botów (@llm) liczą się w minutach, reszta — w sekundach.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '../../.e2e/report', open: 'never' }]],
  outputDir: '../../.e2e/test-results',
  globalSetup: './instance/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
