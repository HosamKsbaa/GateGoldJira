import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'node_modules/.vite',
  test: {
    fsModuleCache: true,
    include: ['src/**/*.spec.ts', 'tooling/**/*.spec.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/app/api/generated/**', 'src/app/api/fixture-generated/**'],
      reportsDirectory: process.env['GATEGOLD_UNIT_COVERAGE_DIRECTORY'] ?? '../.local/coverage/frontend-unit',
      reporter: ['json', 'json-summary', 'text-summary', 'lcov'],
      thresholds: process.env['GATEGOLD_ENFORCE_CODE_COVERAGE'] === '1'
        ? {lines:100, branches:100, functions:100, statements:100} : undefined,
    },
  },
});
