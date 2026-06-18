import { createToken, associateToken, mintTokens, burnTokens } from '../src/services/token.service';

jest.mock('../src/client', () => ({ getClient: jest.fn() }));

describe('TokenService', () => {
  it('exports token functions', () => {
    expect(typeof createToken).toBe('function');
    expect(typeof associateToken).toBe('function');
    expect(typeof mintTokens).toBe('function');
    expect(typeof burnTokens).toBe('function');
  });
});
