import { defineConfig } from "vitest/config";

// Single test runner for the whole monorepo. The suite is deliberately small
// and fast: it covers the pure logic that decides physical behavior (bin-rule
// evaluation, bin capacities) and the server's I/O-adjacent helpers (search
// adapters, caches, retries) with mocked fetch/fs — no database required.
// Test files live next to the code they test inside each package's src/ so
// `tsc --noEmit` typechecks them with the rest of the package.
//
// One exception: `packages/server/src/routes/app.integration.test.ts` runs the
// real Hono app against a scratch Postgres. It self-skips when
// TEST_DATABASE_URL is unset (CI sets it via a pgvector service), so the
// default `pnpm test` needs no database.
//
// `vitest` is declared as a devDependency in packages/shared and
// packages/server as well as the root. Only the root copy is used to run the
// suite; the per-package copies exist so each package's `tsc --noEmit` can
// resolve `vitest` types without relying on pnpm hoisting.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/shared/src/**/*.test.ts",
      "packages/server/src/**/*.test.ts",
    ],
  },
});
