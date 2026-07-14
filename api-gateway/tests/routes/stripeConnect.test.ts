import { getApp, authHeader } from '../helpers';

// Mock stripe service before app is built.
jest.mock('../../src/services/stripe', () => ({
  createConnectAccount: jest.fn().mockResolvedValue({
    accountId:        'acct_test_123',
    chargesEnabled:   false,
    payoutsEnabled:   false,
    detailsSubmitted: false,
    requirements:     { currently_due: ['external_account'] },
  }),
  createConnectAccountLink: jest.fn().mockResolvedValue({
    url:       'https://connect.stripe.com/setup/mock-link',
    expiresAt: 9999999999,
  }),
  retrieveConnectAccount: jest.fn().mockResolvedValue({
    accountId:        'acct_test_123',
    chargesEnabled:   true,
    payoutsEnabled:   true,
    detailsSubmitted: true,
    requirements:     { currently_due: [] },
  }),
}));

jest.mock('@acquis/hedera-service', () => ({
  TransferService: { transferToken: jest.fn(), transferHbar: jest.fn() },
  HCSService:      { submitMessage: jest.fn() },
  NFTService:      { mintCustodialNFT: jest.fn(), updateNFTMetadata: jest.fn() },
  getClient:       jest.fn(),
}));

let merchantStore: any = {
  id: 'cmm_stripe_test', slug: 'stripe-test', legalName: 'Stripe Test Co',
  stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false,
  stripeRequirementsJson: null, status: 'agreement_signed',
  createdAt: new Date(), updatedAt: new Date(),
};

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        merchant: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id === merchantStore.id) return Promise.resolve(merchantStore);
            return Promise.resolve(null);
          }),
          update: jest.fn().mockImplementation(({ data }: any) => {
            merchantStore = { ...merchantStore, ...data };
            return Promise.resolve(merchantStore);
          }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

describe('Stripe Connect routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    merchantStore = {
      id: 'cmm_stripe_test', slug: 'stripe-test', legalName: 'Stripe Test Co',
      stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false,
      stripeRequirementsJson: null, status: 'agreement_signed',
      createdAt: new Date(), updatedAt: new Date(),
    };
    delete process.env.STRIPE_CONNECT_ENABLED;
  });

  it('POST /stripe-connect/create returns 501 when STRIPE_CONNECT_ENABLED unset', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/create`,
      payload: {}, headers: authHeader,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().message).toMatch(/STRIPE_CONNECT_ENABLED/);
  });

  it('POST /stripe-connect/create creates an Express account and mirrors state', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/create`,
      payload: { email: 'ops@stripetest.com' }, headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.stripeAccountId).toBe('acct_test_123');
    expect(body.chargesEnabled).toBe(false);
    expect(body.status).toBe('stripe_pending');
  });

  it('POST /stripe-connect/create returns 409 if account already exists', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    merchantStore.stripeAccountId = 'acct_existing_456';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/create`,
      payload: {}, headers: authHeader,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().stripeAccountId).toBe('acct_existing_456');
  });

  it('POST /stripe-connect/link returns 400 without stripeAccountId on merchant', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/link`,
      payload: { refreshUrl: 'http://x', returnUrl: 'http://y' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /stripe-connect/link returns the Stripe onboarding URL when account exists', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    merchantStore.stripeAccountId = 'acct_test_123';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/link`,
      payload: { refreshUrl: 'http://x', returnUrl: 'http://y' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://connect.stripe.com/setup/mock-link');
  });

  it('GET /stripe-connect/status refreshes mirror columns from Stripe', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    merchantStore.stripeAccountId = 'acct_test_123';
    const res = await app.inject({
      method: 'GET', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/status`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chargesEnabled).toBe(true);
    expect(body.payoutsEnabled).toBe(true);
    expect(body.status).toBe('active');
  });

  it('GET /stripe-connect/status returns 404 without stripeAccountId', async () => {
    process.env.STRIPE_CONNECT_ENABLED = 'true';
    const res = await app.inject({
      method: 'GET', url: `/api/v1/merchants/${merchantStore.id}/stripe-connect/status`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });
});
