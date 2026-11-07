import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The app's own runner. Only the plain-TS lib/ modules are covered here — the
// screens need a device, so they are verified by `tsc` and a Metro bundle.
//
// The `@/` alias is declared in tsconfig for Metro and tsc; vitest does not
// read it, so a lib module that imports the API client or the query keys would
// fail to resolve here while working on the phone. Aliasing it keeps the tested
// code the same code that ships.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
