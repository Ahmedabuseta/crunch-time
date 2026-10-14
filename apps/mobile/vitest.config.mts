import { defineConfig } from 'vitest/config';

// The app's own runner. Only the plain-TS lib/ modules are covered here — the
// screens need a device, so they are verified by `tsc` and a Metro bundle.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
