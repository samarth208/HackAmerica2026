import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  { ignores: ["dist", "node_modules"] },
  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        WebSocket: "readonly",
        NodeFilter: "readonly",
        Date: "readonly",
        JSON: "readonly",
        Array: "readonly",
        Math: "readonly",
        Promise: "readonly",
        Error: "readonly",
        // Test
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
    settings: {
      react: { version: "18" },
    },
    rules: {
      // Core JS
      "no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],

      // React
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",   // Not needed with React 17+ JSX transform
      "react/prop-types": "off",           // No PropTypes in this project

      // React Hooks — use only the established rules, not v7 experimental rules.
      // react-hooks v7 added set-state-in-effect / purity / refs which conflict
      // with valid React 18 external-subscription and timestamp-tracking patterns.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
