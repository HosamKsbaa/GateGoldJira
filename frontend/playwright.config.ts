import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // These acceptance flows intentionally share one seeded company database.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  // A retry must not turn an unstable acceptance scenario into a green gate.
  retries: 0,
  reporter: [['list'], ['./e2e/support/use-case-reporter.ts']],
  use: {
    baseURL: process.env['GATEGOLD_WEB_URL'] ?? 'http://127.0.0.1:14200',
    // Bound a missing or permanently disabled control independently of a long
    // batch test. Explicit assertions still wait for their observable outcome.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Angular gives PORT precedence over --port. Do not inherit the API port.
    env: { PORT: process.env['GATEGOLD_WEB_PORT'] ?? '14200' },
    // Compile once so editing the workspace cannot hot-reload an acceptance scenario.
    command:
      'npm start -- --watch=false --host 127.0.0.1 --port ' +
      (process.env['GATEGOLD_WEB_PORT'] ?? '14200'),
    url: process.env['GATEGOLD_WEB_URL'] ?? 'http://127.0.0.1:14200',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
