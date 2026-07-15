/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  moduleNameMapper: {
    '@acquis/hedera-service': '<rootDir>/../hedera-service/src',
    '@acquis/xrpl-service': '<rootDir>/tests/__mocks__/xrpl-service.ts',
    '^x402-xrpl$': '<rootDir>/tests/__mocks__/x402-xrpl.ts',
    '^xrpl$': '<rootDir>/tests/__mocks__/xrpl.ts',
  },
  globals: {
    'ts-jest': {
      diagnostics: { warnOnly: true },
      isolatedModules: true,
    },
  },
};
