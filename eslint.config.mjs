import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Node.js CommonJS helper scripts (icon generator, diagnostics) legitimately
  // use `require()`. Keep them linted, but disable the ESM-only rule for them.
  {
    files: ["scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next (relative to this project root):
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/supabase/test.ts",
  ]),
]);

export default eslintConfig;
