import { AcquisClient } from '../src/AcquisClient';
import { ConfigError, NetworkError, PaymentError } from '../src/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOk(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status,
    json: async () => body,
  });
}

function mockFail(body: unknown, status = 400) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => body,
  });
}

const CONFIG = {
  apiBaseUrl: 'http://localhost:3000',
  treasuryAccountId: '0.0.11111',
  treasuryKey: 'mock-key',
  tokenId: '0.0.99999',
};

describe('AcquisClient — constructor', () => {
  it('throws ConfigError if apiBaseUrl is missing', () => {
    expect(() => new AcquisClient({ ...CONFIG, apiBaseUrl: '' })).toThrow(ConfigError);
  });

  it('throws ConfigError if treasuryAccountId is missing', () => {
    expect(() => new AcquisClient({ ...CONFIG, treasuryAccountId: '' })).toThrow(ConfigError);
  });

  it('throws ConfigError if treasuryKey is missing', () => {
    expect(() => new AcquisClient({ ...CONFIG, treasuryKey: '' })).toThrow(ConfigError);
  });
});

describe('AcquisClient — createAccount', () => {
  it('POSTs to /accounts and returns account info', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ accountId: '0.0.12345', privateKey: 'pk', publicKey: 'pubk' }, 201);

    const result = await client.createAccount(10);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/accounts',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.accountId).toBe('0.0.12345');
  });
});

describe('AcquisClient — getAccount', () => {
  it('GETs /accounts/:id', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ accountId: '0.0.12345' });

    const result = await client.getAccount('0.0.12345');
    expect(result.accountId).toBe('0.0.12345');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/accounts/0.0.12345',
    );
  });
});

describe('AcquisClient — pay (token)', () => {
  it('POSTs to /transfers/token', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ tokenId: '0.0.99999', fromId: '0.0.11111', toId: '0.0.22222', amount: 50 });

    const result = await client.pay({ toAccountId: '0.0.22222', amount: 50 });

    expect(result.success).toBe(true);
    expect(result.transfer?.amount).toBe(50);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/transfers/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws PaymentError on API failure', async () => {
    const client = new AcquisClient(CONFIG);
    mockFail({ message: 'Insufficient balance' });

    await expect(client.pay({ toAccountId: '0.0.22222', amount: 50 })).rejects.toThrow(PaymentError);
  });

  it('throws ConfigError if no tokenId configured', async () => {
    const client = new AcquisClient({ ...CONFIG, tokenId: undefined });
    await expect(client.pay({ toAccountId: '0.0.22222', amount: 50 })).rejects.toThrow(PaymentError);
  });
});

describe('AcquisClient — pay (hbar)', () => {
  it('POSTs to /transfers/hbar', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ fromId: '0.0.11111', toId: '0.0.22222', amount: 5, asset: 'HBAR' });

    const result = await client.pay({ toAccountId: '0.0.22222', amount: 5, mode: 'hbar' });

    expect(result.success).toBe(true);
    expect(result.transfer?.asset).toBe('HBAR');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/transfers/hbar',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('AcquisClient — tryPay', () => {
  it('returns success:false instead of throwing on error', async () => {
    const client = new AcquisClient(CONFIG);
    mockFail({ message: 'Timeout' });

    const result = await client.tryPay({ toAccountId: '0.0.22222', amount: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('AcquisClient — mintTokens', () => {
  it('POSTs to /tokens/:id/mint', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ minted: 100, status: 'SUCCESS' });

    const result = await client.mintTokens('0.0.99999', 100);
    expect(result.minted).toBe(100);
  });
});

describe('AcquisClient — burnTokens', () => {
  it('POSTs to /tokens/:id/burn', async () => {
    const client = new AcquisClient(CONFIG);
    mockOk({ burned: 20, status: 'SUCCESS' });

    const result = await client.burnTokens('0.0.99999', 20);
    expect(result.burned).toBe(20);
  });
});

describe('NetworkError', () => {
  it('is thrown when fetch rejects', async () => {
    const client = new AcquisClient(CONFIG);
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(client.getAccount('0.0.1')).rejects.toThrow(NetworkError);
  });
});
