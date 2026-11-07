import { defineConfig, devices } from '@playwright/test';

/**
 * e2e Playwright contre l'API réelle (CLAUDE.md, handbook §10) : jamais de mock du backend.
 *
 * Deux serveurs avant les tests :
 * - psymate-api sur :8080, lancée à part (../psymate-api : make up && make run, puis
 *   make seed SIZE=small ; en CI, le job e2e). Playwright attend /actuator/health.
 * - l'application construite (pnpm build), servie avec ses deux langues sous /fr/ et /en/
 *   et le proxy /api → :8080 par tools/serve-dist.mjs. pnpm e2e reconstruit avant de lancer.
 */
const CI = !!process.env['CI'];
const API_HEALTH = 'http://localhost:8080/actuator/health';
const WEB = 'http://localhost:4200';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'psymate-api',
      command: 'node tools/wait-api.mjs',
      url: API_HEALTH,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      name: 'psymate-web',
      command: 'node tools/serve-dist.mjs',
      url: `${WEB}/fr/`,
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
  ],
});
