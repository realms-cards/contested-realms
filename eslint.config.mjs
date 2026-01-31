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
];

export default eslintConfig;
