import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["**/node_modules/", "**/dist/", "**/build/"],
  },
  js.configs.recommended,
  {
    files: ["client/**/*.{js,jsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["client/**/*.{test,spec}.{js,jsx}", "client/**/__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["server/**/*.{test,spec}.js", "server/**/__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  // Worker de Cloudflare + adaptadores/storage que son ESM puro.
  // ESLint los parseaba como CommonJS y ni los analizaba; aca los tratamos
  // como modulos con los globals de Workers (mas Buffer/process/console que
  // el runtime de Cloudflare expone con nodejs_compat).
  {
    files: ["worker.js", "server/src/db/d1Adapter.js", "server/src/storage/r2Storage.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.worker,
        ...globals.browser,
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
    },
  },
  // Entrypoint serverless de Vercel: es CommonJS (module.exports / require).
  {
    files: ["api/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  // Scripts de migracion: .mjs, corren en Node como ESM.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  prettierConfig,
];
