import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './test/e2e',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { trace: 'retain-on-failure' },
  reporter: 'list'
})
