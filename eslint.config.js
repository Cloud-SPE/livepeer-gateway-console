// ESLint 9 flat config for livepeer-gateway-console.
// Loads the local custom plugin from ./lint/.

import tseslint from "typescript-eslint";
import livepeerGatewayConsole from "./lint/eslint-plugin-livepeer-gateway-console/index.js";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "**/*.d.ts",
      "admin-ui/**",
      "lint/**",
      "migrations/**",
      // buf-generated stubs — never lint generated code.
      "src/providers/payerDaemon/gen/**",
      "src/providers/resolver/gen/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: {
      "livepeer-gateway-console": livepeerGatewayConsole,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Allow `_`-prefixed unused params — common in stub providers.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "livepeer-gateway-console/layer-check": "error",
      "livepeer-gateway-console/no-cross-cutting-import": "error",
      "livepeer-gateway-console/zod-at-boundary": "error",
      "livepeer-gateway-console/no-secrets-in-logs": "error",
      "livepeer-gateway-console/file-size": "warn",
      "livepeer-gateway-console/types-shape": "error",
    },
  },
);
