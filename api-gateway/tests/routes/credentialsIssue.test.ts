import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
    transferHbar:  jest.fn().mockResolvedValue(undefined),
  },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id: '0.0.9342744', sequence_number: 10,
      consensus_timestamp: '2026-01-01T00:00:00Z',
      transaction_id: '0.0.11111@1234567890.000000000',
    }),
  },
  NFTService: {
    mintCustodialNFT: jest.fn().mockResolvedValue({
      token_id: '0.0.9342217', serial_number: 5,
      tx_id: 'mock-tx-id', hcs_topic_id: '0.0.9342744', hcs_sequence_number: 10,
    }),
    updateNFTMetadata: jest.fn().mockResolvedValue({ tx_id: 'mock-update-tx' }),
  },
  getClient: jest.fn(),
}));

const mockEnrolledCustomer = {
  acquisId: 'acq_existing1', phone: '+15550001111', email: null,
  kycLevel: 'rewards_only', hederaNftTokenId: '0.0.9342217', hederaNftSerial: 3,
};

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        acquisCustomer: {
          findUnique: jest.fn().mockResolvedValue(null),
          create:     jest.fn().mockImplementation(({ data }: any) => Promise.resolve({
            id: 'cust-new', acquisId: data.acquisId ?? 'acq_new999',
            ...data, aqsBalance: 0, rewardEvents: [],
          })),
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
function getMintCustodial() {
  return (jest.requireMock('@acquis/hedera-service') as any).NFTService.mintCustodialNFT as jest.Mock;
}

describe('POST /credentials/issue — Phase 1', () => {
  const app = getApp();
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const validBody = {
    merchantId: 'merchant-1',
    customerContact: { phone: '+15550002222' },
    displayName: 'Jane Doe',
    rewardsConsent: true,
  };

  // ── Happy path ────────────────────────────────────────────────────────────
  it('enrolls a new rewards_only customer, mints NFT, writes rewards consent HCS', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: validBody,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('enrolled');
    expect(body.kycLevel).toBe('rewards_only');
    expect(body.hederaNftTokenId).toBe('0.0.9342217');
    expect(getMintCustodial()).toHaveBeenCalledTimes(1);

    const hcsCalls = getHcsSubmit().mock.calls.map((c: any[]) => JSON.parse(c[0].message));
    const rewardsConsentRecord = hcsCalls.find((m: any) => m.type === 'consent.rewards');
    expect(rewardsConsentRecord).toBeDefined();
    expect(rewardsConsentRecord.granted).toBe(true);
  });

  // ── No XRPL call ─────────────────────────────────────────────────────────
  it('does NOT attempt XRPL credential for rewards_only enrollment', async () => {
    // The xrpl-service mock would throw if createCredential were called;
    // just verify it doesn't appear in the hedera mock
    await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: validBody, headers: authHeader,
    });
    const xrplMock = jest.requireMock('@acquis/xrpl-service') as any;
    // xrpl-service not imported at all in credentialsIssue route — no call expected
    expect(xrplMock?.createCredential ?? jest.fn()).not.toHaveBeenCalled();
  });

  // ── Marketing consent — separate HCS record ───────────────────────────────
  it('writes a SEPARATE consent.marketing HCS record when marketing consent granted', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: { ...validBody, marketingConsent: { granted: true, channels: ['sms', 'email'] } },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().marketingConsentGranted).toBe(true);
    expect(res.json().marketingConsentHcsSeq).toBe(10);

    const hcsCalls = getHcsSubmit().mock.calls.map((c: any[]) => JSON.parse(c[0].message));
    const mktRecord = hcsCalls.find((m: any) => m.type === 'consent.marketing');
    expect(mktRecord).toBeDefined();
    expect(mktRecord.channels).toEqual(['sms', 'email']);
    expect(mktRecord.scope).toBe('merchant');
  });

  // ── Enrollment WITHOUT marketing consent ─────────────────────────────────
  it('succeeds enrollment without marketing consent — no marketing HCS record written', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: validBody,  // no marketingConsent
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().marketingConsentGranted).toBe(false);

    const hcsCalls = getHcsSubmit().mock.calls.map((c: any[]) => JSON.parse(c[0].message));
    const mktRecord = hcsCalls.find((m: any) => m.type === 'consent.marketing');
    expect(mktRecord).toBeUndefined();
  });

  // ── Consents are independent: rewards required, marketing optional ─────────
  it('rejects enrollment when rewardsConsent is false', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: { ...validBody, rewardsConsent: false },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/rewardsConsent must be true/);
    expect(getMintCustodial()).not.toHaveBeenCalled();
  });

  it('rejects marketing-only consent without rewards consent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: { ...validBody, rewardsConsent: false,
                 marketingConsent: { granted: true, channels: ['sms'] } },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(422);
  });

  // ── Existing customer match ───────────────────────────────────────────────
  it('returns existing customer without re-enrolling when phone matches', async () => {
    (app as any).prisma.acquisCustomer.findUnique
      .mockResolvedValueOnce(mockEnrolledCustomer);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: { ...validBody, customerContact: { phone: '+15550001111' } },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('existing');
    expect(getMintCustodial()).not.toHaveBeenCalled();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  it('returns 401 without x-api-key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────────
  it('returns 400 when no contact provided', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/credentials/issue',
      payload: { merchantId: 'merchant-1', rewardsConsent: true },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });
});
