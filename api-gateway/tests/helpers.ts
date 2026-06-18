import { buildApp } from '../src/app';

export const TEST_KEY = 'test-key-abc123';

// Set API_KEYS before any test builds the app
process.env.API_KEYS = TEST_KEY;

export function getApp() {
  return buildApp();
}

export const authHeader = { 'x-api-key': TEST_KEY };
