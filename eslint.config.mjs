import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["electron/**/*.cjs", "scripts/**/*.cjs"],
    rules: {
      // Electron's declared entry format is CommonJS; require() is correct in .cjs files.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist-electron/**",
    "local-only/**",
    "next-env.d.ts",
    // Historical one-off scripts are preserved as records, not active source code.
    "archive/**",
  ]),
]);

export default eslintConfig;
