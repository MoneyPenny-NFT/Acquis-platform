import { getApp, authHeader } from '../helpers';

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('@acquis/hedera-service', () => ({
  TransferService: { transferToken: jest.fn(), transferHbar: jest.fn() },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:            '0.0.9342744',
      sequence_number:     555,
      consensus_timestamp: '2026-07-13T00:00:00Z',
      transaction_id:      '0.0.9186941@1783950000.000000000',
    }),
  },
  NFTService: { mintCustodialNFT: jest.fn(), updateNFTMetadata: jest.fn() },
  getClient: jest.fn(),
}));

const mockMerchant = {
  id:                    'cmm_test_123',
  slug:                  'test-merchant',
  legalName:             'Test Co LLC',
  dbaName:               null,
  entityType:            'llc',
  ein:                   null,
  formationState:        null,
  formationDate:         null,
  addressLine1:          null, addressLine2: null,
  addressCity:           null, addressState: null, addressPostal: null,
  websiteUrl:            null, businessDescription: null, mccCode: null,
  agreementHash:         null,
  agreementSignedAt:     null,
  agreementSignedBy:     null,
  hcsAgreementTopicId:   null,
  hcsAgreementSeqNumber: null,
  hcsAgreementTxId:      null,
  stripeAccountId:       null,
  stripeChargesEnabled:  false,
  stripePayoutsEnabled:  false,
  stripeRequirementsJson: null,
  status:                'pending',
  createdAt:             new Date(),
  updatedAt:             new Date(),
};

let merchantStore = { ...mockMerchant };

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        merchant: {
          create:     jest.fn().mockImplementation(({ data }: any) => {
            merchantStore = { ...merchantStore, ...data, id: 'cmm_new_id', createdAt: new Date(), updatedAt: new Date() };
            return Promise.resolve(merchantStore);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id === merchantStore.id) return Promise.resolve(merchantStore);
            return Promise.resolve(null);
          }),
          findMany:   jest.fn().mockResolvedValue([mockMerchant]),
          count:      jest.fn().mockResolvedValue(1),
          update:     jest.fn().mockImplementation(({ data }: any) => {
            merchantStore = { ...merchantStore, ...data, updatedAt: new Date() };
            return Promise.resolve(merchantStore);
          }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

function getHcsSubmit() {
  return (jest.requireMock('@acquis/hedera-service') as any).HCSService.submitMessage as jest.Mock;
}

describe('Merchant CRUD + agreement HCS write', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    merchantStore = { ...mockMerchant };
    delete process.env.MERCHANT_AGREEMENT_ENABLED;
  });

  it('POST /merchants creates a merchant with 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants',
      payload: { legalName: 'Acme Co LLC', entityType: 'llc' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.legalName).toBe('Acme Co LLC');
    expect(body.entityType).toBe('llc');
    expect(body.status).toBe('pending');
  });

  it('POST /merchants returns 400 when legalName missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants',
      payload: { entityType: 'llc' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/legalName is required/);
  });

  it('GET /merchants returns list with total', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants', headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(Array.isArray(body.merchants)).toBe(true);
  });

  it('GET /merchants/:id returns 200 for existing merchant', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/merchants/${mockMerchant.id}`, headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(mockMerchant.id);
  });

  it('GET /merchants/:id returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchants/does-not-exist', headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /merchants/:id updates fields', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/merchants/${mockMerchant.id}`,
      payload: { legalName: 'Renamed Co LLC', mccCode: '5812' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().legalName).toBe('Renamed Co LLC');
    expect(res.json().mccCode).toBe('5812');
  });

  it('POST /agreement/sign returns 501 when MERCHANT_AGREEMENT_ENABLED is unset', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${mockMerchant.id}/agreement/sign`,
      payload: { agreementText: 'draft terms', signedByName: 'Jane Doe' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().message).toMatch(/attorney review/i);
  });

  it('POST /agreement/sign writes HCS record with sha256(agreementText) when enabled', async () => {
    process.env.MERCHANT_AGREEMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${mockMerchant.id}/agreement/sign`,
      payload: { agreementText: 'agreement text v1', signedByName: 'Jane Doe' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // SHA-256 of "agreement text v1" — recomputed here for the assertion
    const expectedHash = require('crypto').createHash('sha256').update('agreement text v1', 'utf8').digest('hex');
    expect(body.agreementHash).toBe(expectedHash);
    expect(body.signedByName).toBe('Jane Doe');
    expect(body.hcsSequenceNumber).toBe(555);
    expect(body.status).toBe('agreement_signed');

    // Confirm the HCS write was actually invoked with correct payload
    const calls = getHcsSubmit().mock.calls;
    expect(calls.length).toBe(1);
    const msg = JSON.parse(calls[0][0].message);
    expect(msg.type).toBe('merchant.agreement.signed');
    expect(msg.merchantId).toBe(mockMerchant.id);
    expect(msg.agreementHash).toBe(expectedHash);
    expect(msg.signedByName).toBe('Jane Doe');
  });

  it('POST /agreement/sign returns 400 when body missing agreementText or signedByName', async () => {
    process.env.MERCHANT_AGREEMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${mockMerchant.id}/agreement/sign`,
      payload: { agreementText: 'text without a signer' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /agreement/sign returns 404 for unknown merchant', async () => {
    process.env.MERCHANT_AGREEMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants/does-not-exist/agreement/sign',
      payload: { agreementText: 'text', signedByName: 'X' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /agreement/sign returns 401 without x-api-key', async () => {
    process.env.MERCHANT_AGREEMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${mockMerchant.id}/agreement/sign`,
      payload: { agreementText: 'text', signedByName: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});
