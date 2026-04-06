import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default defineConfig([
  {
    ignores: ["coverage/**", "out/**"],
  },
  {
    files: ["src/**/*.{js,ts}"],
    plugins: { js },
    extends: ["js/recommended", eslintPluginPrettierRecommended],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{js,ts}"],
    extends: [tseslint.configs.strictTypeChecked],
  },
  eslintConfigPrettier,
]);
