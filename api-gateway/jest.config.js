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
  },
};
