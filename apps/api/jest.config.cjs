const common = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      useESM: true,
      tsconfig: "tsconfig.test.json"
    }]
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  clearMocks: true
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: "unit",
      testMatch: ["**/src/__tests__/**/*.test.ts", "**/tests/**/*.unit.test.ts"],
      testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"]
    },
    {
      ...common,
      displayName: "integration",
      testMatch: ["**/src/__tests__/**/*.integration.test.ts", "**/tests/**/*.test.ts"],
      testPathIgnorePatterns: ["\\.unit\\.test\\.ts$"],
      setupFiles: ["<rootDir>/tests/setupEnv.cjs"],
      setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"]
    }
  ],
  testTimeout: 30000
};
