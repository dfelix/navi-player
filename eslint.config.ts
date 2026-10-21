import { globalIgnores } from "eslint/config";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";

export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },

  globalIgnores([
    "**/dist/**",
    "**/dist-server/**",
    "**/coverage/**",
    "test-results/**",
    "playwright-report/**",
  ]),

  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  skipFormatting,

  {
    // CommonJS tooling for Jest (environment, transformer, Babel config).
    name: "app/commonjs",
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    name: "app/rules",
    rules: {
      // Underscore-prefixed parameters are intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Optional props in typed defineProps already default to undefined.
      "vue/require-default-prop": "off",
    },
  },
);
