import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**", // Ignore compiled server code (uses CommonJS)
      "bots/**", // Ignore bot engine (uses CommonJS)
      "vendor/**", // Pristine upstream copies (scripts/vendor-untested-realm.sh)
      "next-env.d.ts",
      "scripts/**",
      "public/ktx2/**", // Ignore third-party transcoder files
      // Ignore tests and spec files
      "tests/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "specs/**",
      // Ignore local debug/test helpers executed with Node (CommonJS)
      "debug-*.js",
      "test-*.js",
    ],
  },
  // Allow require() in server .js files (CommonJS modules)
  {
    files: ["server/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Enforce stronger TypeScript practices to prevent regressions
      "@typescript-eslint/no-explicit-any": "error", // Prevent explicit 'any' usage
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }], // Ignore underscore-prefixed variables
      "@typescript-eslint/prefer-as-const": "error", // Encourage 'as const' over literal types
      "@typescript-eslint/no-non-null-assertion": "warn", // Discourage ! operator
      "@typescript-eslint/explicit-function-return-type": "off", // Allow inference for better DX

      // Code quality rules to maintain improvements
      "prefer-const": "error", // Enforce const over let when possible
      "no-var": "error", // No var declarations
      "object-shorthand": "error", // Use shorthand object syntax

      // Import/export best practices
      "import/no-unused-modules": "off", // Can be noisy in development
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc" },
        },
      ],

      // React/Next.js specific improvements
      "@next/next/no-img-element": "off", // Game overlays use <img> for dynamic card art; next/image is irrelevant here
      "react/jsx-no-useless-fragment": "warn",
      "react/self-closing-comp": "warn",

      // Performance and correctness
      "react-hooks/exhaustive-deps": "warn", // Keep dependency warnings visible

      // Three.js and React Three Fiber best practices
      // Encourage proper disposal of Three.js resources
      "no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      // Ensure Three.js objects are properly managed
      "no-global-assign": "error",
    },
  },
  {
    // The server build used to be fenced off from the app by `rootDir: "."` in
    // server/tsconfig.json — tsc simply refused an import that climbed out of server/. That
    // fence had to come down so the server could compile the vendored rules engine alongside
    // itself (see server/modules/engine/), and this rule is what replaces it.
    //
    // The constraint is about RUNTIME code, not types: server/types/socket-events.d.ts has
    // always pulled types out of src/lib/net, and that is fine — a declaration file emits
    // nothing, so nothing has to resolve at run time. It is importing a VALUE that breaks,
    // which is why server/modules/meta-stats-compute.ts carries a duplicate of pure helpers
    // from src/ instead of importing them. Declaration files are therefore exempt below.
    //
    // The engine is reached by RELATIVE path, never the `@sorcery/shared` alias: the alias is
    // inherited from the root tsconfig and type-checks, and tsx resolves it in development,
    // but tsc does not rewrite path aliases when emitting CommonJS — so the alias would fail
    // only in production.
    files: ["server/**/*.{ts,tsx,js}", "shared/**/*.{ts,tsx,js}"],
    ignores: ["server/**/*.d.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Only the APP's src/, which is always reached either by the @/ alias or by
              // climbing straight out of server/. A bare `**/src/*` would also match
              // vendor/untested-realm/shared/src, which is exactly what the server is
              // supposed to import.
              group: ["@/*", "../src/*", "../../src/*", "../../../src/*", "../../../../src/*"],
              message:
                "The server cannot import RUNTIME code from src/ — it is a separate tsc build and a separate image. Types are fine in a .d.ts; for anything executable, duplicate the pure helper (see server/modules/meta-stats-compute.ts) or move it somewhere both can reach.",
            },
            {
              group: ["@sorcery/shared", "@sorcery/shared/*", "@untested-realm/*", "@shared/*"],
              message:
                "Import the engine and shared/ by RELATIVE path from server code. tsc does not rewrite path aliases into the emitted CommonJS, so an alias resolves under server:dev (tsx) and breaks in the production image.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
