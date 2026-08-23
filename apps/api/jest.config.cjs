module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: [
  "**/__tests__/**/*.test.ts",
  "**/tests/**/*.test.ts"
  ],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/jest.setup.ts"],
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    "ts-jest": {
      useESM: true,
      tsconfig: "tsconfig.test.json"
    }
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  testTimeout: 30000,
  clearMocks: true
};