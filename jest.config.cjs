module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      globalSetup: '<rootDir>/tests/support/global-setup.cjs',
      globalTeardown: '<rootDir>/tests/support/global-teardown.cjs',
      setupFilesAfterEnv: ['<rootDir>/tests/support/browser.cjs'],
    },
  ],
};
