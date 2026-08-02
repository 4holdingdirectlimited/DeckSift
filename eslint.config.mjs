import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "**/.turbo/**",
    // Upstream only ships a lint config for packages/web — server/shared have
    // no rules to run. Ignoring them keeps `eslint .` from the repo root from
    // parsing TS as plain JS, and stops the ESLint language server from
    // flagging them as "no matching configuration". Proper lint rules for
    // server/shared are a follow-up; type safety is already enforced by tsc.
    "packages/server/**",
    "packages/shared/**",
  ]),
]);

export default eslintConfig;
