import { createAccount, getAccountInfo } from '../src/services/account.service';

jest.mock('../src/client', () => ({ getClient: jest.fn() }));

describe('AccountService', () => {
  it('exports createAccount and getAccountInfo', () => {
    expect(typeof createAccount).toBe('function');
    expect(typeof getAccountInfo).toBe('function');
  });
});
