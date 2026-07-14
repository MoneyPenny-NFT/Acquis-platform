import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  AccountService: {
    createAccount: jest.fn().mockResolvedValue({ accountId: '0.0.12345', privateKey: 'mock-private-key', publicKey: 'mock-public-key' }),
    getAccountInfo: jest.fn().mockResolvedValue({ accountId: '0.0.12345' }),
  },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:            '0.0.9342744',
      sequence_number:     8,
      consensus_timestamp: '2026-06-29T00:00:00.000Z',
      transaction_id:      '0.0.9186941@1000000000.000000000',
    }),
  },
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

describe('Account routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  it('POST /api/v1/accounts returns 201 with account fields', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/accounts',
      payload: { initialHbar: 10 }, headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accountId).toBe('0.0.12345');
    expect(body).toHaveProperty('privateKey');
    expect(body).toHaveProperty('publicKey');
  });

  it('GET /api/v1/accounts/:accountId returns account info', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/accounts/0.0.12345',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accountId).toBe('0.0.12345');
  });

  it('POST /api/v1/accounts/:id/credit returns 201 with HCS sequence number', async () => {
    process.env.ACQUIS_CONSENT_HCS_TOPIC_ID = '0.0.9342744';

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/accounts/0.0.9218284/credit',
      payload: { amountCents: 7500, fundingRequestId: 'rfp-abc' },
      headers: authHeader,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.account_id).toBe('0.0.9218284');
    expect(body.amountCents).toBe(7500);
    expect(body.hcs_sequence_number).toBe(8);
    expect(body.hcs_transaction_id).toBe('0.0.9186941@1000000000.000000000');
  });

  it('POST /api/v1/accounts/:id/credit returns 400 when amountCents missing', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/accounts/0.0.9218284/credit',
      payload: { fundingRequestId: 'rfp-abc' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });
});
