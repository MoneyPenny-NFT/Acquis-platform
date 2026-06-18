import { transferHbar, transferToken } from '../src/services/transfer.service';

jest.mock('../src/client', () => ({ getClient: jest.fn() }));

describe('TransferService', () => {
  it('exports transfer functions', () => {
    expect(typeof transferHbar).toBe('function');
    expect(typeof transferToken).toBe('function');
  });
});
