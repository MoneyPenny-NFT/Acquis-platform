import { getApp, authHeader } from '../helpers';

// ── Mocks ─────────────────────────────────────────────────────────────────
jest.mock('@acquis/hedera-service', () => ({
  TransferService: { transferToken: jest.fn(), transferHbar: jest.fn() },
  HCSService:      { submitMessage: jest.fn() },
  NFTService:      { mintCustodialNFT: jest.fn(), updateNFTMetadata: jest.fn() },
  getClient:       jest.fn(),
}));

const mockCustomer = {
  id:                      'cust-internal-1',
  acquisId:                'acq_workstreamc_1',
  phone:                   '+15550009999',
  email:                   'wallet@example.com',
  displayName:             'Wallet Test User',
  hederaNftTokenId:        '0.0.9342217',
  hederaNftSerial:         42,
  kycLevel:                'rewards_only',
  tier:                    'starter',
  aqsBalance:              1234,
  enrollingMerchantId:     'merchant-1',
  rewardsConsentGranted:   true,
  rewardsConsentAt:        new Date(),
  marketingConsentGranted: true,
  marketingConsentChannels: JSON.stringify(['email', 'sms']),
  marketingConsentAt:      new Date(),
  status:                  'active',
  createdAt:               new Date(),
  updatedAt:               new Date(),
};

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        acquisCustomer: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.phone === mockCustomer.phone) return Promise.resolve(mockCustomer);
            if (where.email === mockCustomer.email) return Promise.resolve(mockCustomer);
            return Promise.resolve(null);
          }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

describe('GET /customers/lookup — Phase 4 Workstream C', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => { jest.clearAllMocks(); });

  it('returns customer record by phone', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customers/lookup?phone=${encodeURIComponent(mockCustomer.phone)}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acquisId).toBe(mockCustomer.acquisId);
    expect(body.displayName).toBe(mockCustomer.displayName);
  });

  it('returns customer record by email', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customers/lookup?email=${encodeURIComponent(mockCustomer.email)}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().acquisId).toBe(mockCustomer.acquisId);
  });

  it('returns 404 for unknown contact', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/customers/lookup?phone=%2B15550000000',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/not found/i);
  });

  it('returns 400 when neither phone nor email provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/customers/lookup',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/phone or email/i);
  });

  it('returns 401 without x-api-key', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customers/lookup?phone=${encodeURIComponent(mockCustomer.phone)}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not leak sensitive customer fields in the lookup response', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customers/lookup?phone=${encodeURIComponent(mockCustomer.phone)}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Allow-list: exactly these two keys and nothing else.
    expect(Object.keys(body).sort()).toEqual(['acquisId', 'displayName']);
    // Explicit denial checks for anything a curious attacker might probe for.
    expect(body).not.toHaveProperty('aqsBalance');
    expect(body).not.toHaveProperty('kycLevel');
    expect(body).not.toHaveProperty('tier');
    expect(body).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('marketingConsentChannels');
    expect(body).not.toHaveProperty('marketingConsentGranted');
    expect(body).not.toHaveProperty('rewardsConsentGranted');
    expect(body).not.toHaveProperty('hederaNftTokenId');
    expect(body).not.toHaveProperty('hederaNftSerial');
    expect(body).not.toHaveProperty('enrollingMerchantId');
  });
});
