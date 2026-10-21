/** @type {import('jest').Config} */
export default {
  testEnvironment: "<rootDir>/tests/jsdom-environment.cjs",
  testEnvironmentOptions: {
    // Resolve packages' Node (CommonJS) builds rather than their browser ESM
    // builds, which Jest can't load without transforming node_modules.
    customExportConditions: ["node", "node-addons"],
  },
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json", "vue"],
  transform: {
    "^.+\\.vue$": "<rootDir>/tests/vue-transformer.cjs",
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.jest.json" }],
    // ESM-only dependencies (below) are converted to CommonJS by Babel.
    "^.+\\.m?js$": "babel-jest",
  },
  // Ignored (left untransformed) unless the package is known to ship ESM only,
  // or the file is an .mjs module.
  transformIgnorePatterns: [
    "/node_modules/(?!(pinia|vue-router|@tanstack|lucide-vue-next|reka-ui|@vueuse|@floating-ui|@internationalized|@swc|defu|ohash|aria-hidden)/)(?!.*\\.mjs$)",
  ],
  moduleNameMapper: {
    // import.meta.env doesn't exist under Jest; tests set the value directly.
    "^@/lib/env$": "<rootDir>/tests/mocks/env.ts",
    // Before the @/ alias, which would otherwise claim "@/assets/logo.svg".
    "\\.(png|jpe?g|svg|webp)$": "<rootDir>/tests/mocks/file.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/tests/mocks/style.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ["src/**/*.{ts,vue}", "!src/main.ts", "!src/**/*.d.ts"],
};
