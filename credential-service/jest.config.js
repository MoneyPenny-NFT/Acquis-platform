/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  testTimeout: 15000,
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
  },
  moduleNameMapper: {
    '^@acquis/hedera-service$': '<rootDir>/../hedera-service/src/index.ts',
    '^@acquis/xrpl-service$':   '<rootDir>/../xrpl-service/src/index.ts',
    '^@prisma/client$':          '<rootDir>/../node_modules/@prisma/client',
  },
};
