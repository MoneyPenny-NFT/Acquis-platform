import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TransferService: { transferToken: jest.fn(), transferHbar: jest.fn() },
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:            '0.0.9342744',
      sequence_number:     777,
      consensus_timestamp: '2026-07-13T00:00:00Z',
      transaction_id:      '0.0.9186941@1783950000.000000000',
    }),
  },
  NFTService: { mintCustodialNFT: jest.fn(), updateNFTMetadata: jest.fn() },
  getClient: jest.fn(),
}));
jest.mock('@acquis/xrpl-service');
import * as xrpl from '@acquis/xrpl-service';
const createCredentialMock = xrpl.createCredential as jest.MockedFunction<typeof xrpl.createCredential>;

// Stub xumm module — always returns a synthetic payload
jest.mock('../../src/services/xumm', () => ({
  createSignInPayload: jest.fn().mockImplementation(async ({ sessionId }) => ({
    uuid: `stub-uuid-${sessionId}`,
    next: { always: `https://xumm.app/sign/stub-${sessionId}` },
    refs: {
      qr_png:           `https://xumm.app/sign/stub-${sessionId}_q.png`,
      qr_matrix:        `https://xumm.app/sign/stub-${sessionId}_q.json`,
      websocket_status: `wss://xumm.app/sign/stub-${sessionId}`,
    },
    pushed: false,
  })),
  getPayloadStatus: jest.fn(),
  isXummConfigured: jest.fn().mockReturnValue(false),
}));

const MERCHANT_ID    = 'merchant-1';
const XRPL_ADDR      = 'raGuDLSziK7KdbeNDnYKBVFqAXfU91Cfya';
const EXISTING_ACQ_ID = 'acq_pos_test_1';

const mockMerchant = { id: MERCHANT_ID, legalName: 'Merchant 1' };

let sessionStore: any = null;
let customerStore: any = null;

jest.mock('../../src/plugins/prisma', () => {
  const fp = jest.requireActual<typeof import('fastify-plugin')>('fastify-plugin');
  return {
    default: fp(async (app: any) => {
      app.decorate('prisma', {
        merchant: {
          findUnique: jest.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(where.id === MERCHANT_ID ? mockMerchant : null)),
        },
        enrollmentSession: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            sessionStore = { id: 'sess_test_1', createdAt: new Date(), updatedAt: new Date(), status: 'pending', ...data };
            return Promise.resolve(sessionStore);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(sessionStore && where.id === sessionStore.id ? sessionStore : null)),
          update: jest.fn().mockImplementation(({ data }: any) => {
            sessionStore = { ...sessionStore, ...data, updatedAt: new Date() };
            return Promise.resolve(sessionStore);
          }),
        },
        acquisCustomer: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (customerStore && (where.xrplAddress === customerStore.xrplAddress ||
                where.phone === customerStore.phone ||
                where.email === customerStore.email ||
                where.acquisId === customerStore.acquisId)) return Promise.resolve(customerStore);
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            customerStore = { acquisId: EXISTING_ACQ_ID, aqsBalance: 0, kycLevel: data.kycLevel, ...data };
            return Promise.resolve(customerStore);
          }),
          update: jest.fn().mockImplementation(({ data }: any) => {
            customerStore = { ...customerStore, ...data };
            return Promise.resolve(customerStore);
          }),
        },
      });
      app.decorate('dbReady', true);
      app.addHook('onClose', async () => {});
    }, { name: 'prisma' }),
  };
});

describe('QR enrollment routes', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStore = null;
    customerStore = null;
    delete process.env.QR_ENROLLMENT_ENABLED;
    createCredentialMock.mockResolvedValue({ txHash: 'MOCKCREDCREATE', credentialId: 'stub' });
  });

  it('GET /enrollment/consent-text always returns the current version + hash + text', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/enrollment/consent-text', headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.version).toBe('string');
    expect(typeof body.hash).toBe('string');
    expect(body.hash).toHaveLength(64);
    expect(body.text).toContain('wallet');
    expect(body.text).toContain('identity');
  });

  it('POST /enrollment/qr/session returns 501 when QR_ENROLLMENT_ENABLED is unset', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().message).toMatch(/attorney review/i);
  });

  it('POST /enrollment/qr/session creates a session with QR data', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.sessionId).toBe('sess_test_1');
    expect(body.qrPng).toMatch(/stub-sess_test_1/);
    expect(body.consentVersion).toBeDefined();
    expect(body.consentHash).toHaveLength(64);
  });

  it('POST /enrollment/qr/session returns 400 without merchantId', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: {}, headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /enrollment/qr/session returns 400 for unsupported chain', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID, chain: 'hedera' }, headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/chain=xrpl/);
  });

  it('POST /enrollment/qr/session returns 404 for unknown merchant', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: 'does-not-exist' }, headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /complete captures xrplAddress, mints credential, writes HCS, marks completed', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    // Create session first
    await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    // Complete via mocked wallet callback
    const res = await app.inject({
      method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
      payload: { xrplAddress: XRPL_ADDR, customerContact: { phone: '+15559990002' } },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('completed');
    expect(body.xrplAddress).toBe(XRPL_ADDR);
    expect(body.credentialTxHash).toBe('MOCKCREDCREATE');
    expect(body.hcsConsentSeqNumber).toBe(777);
    expect(createCredentialMock).toHaveBeenCalledWith(expect.objectContaining({ subjectAddress: XRPL_ADDR }));
  });

  it('POST /complete returns 409 when session is already completed', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    await app.inject({
      method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
      payload: { xrplAddress: XRPL_ADDR }, headers: authHeader,
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
      payload: { xrplAddress: XRPL_ADDR }, headers: authHeader,
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /complete returns 410 when session expired', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    sessionStore.expiresAt = new Date(Date.now() - 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
      payload: { xrplAddress: XRPL_ADDR }, headers: authHeader,
    });
    expect(res.statusCode).toBe(410);
  });

  it('POST /cancel transitions pending → cancelled', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID }, headers: authHeader,
    });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/cancel`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('cancelled');
  });

  it('endpoints return 401 without x-api-key', async () => {
    process.env.QR_ENROLLMENT_ENABLED = 'true';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrollment/qr/session',
      payload: { merchantId: MERCHANT_ID },
    });
    expect(res.statusCode).toBe(401);
  });

  // ─── Reserve-impact fail-graceful tests ────────────────────────────────
  //
  // Q1 (empirical, resolved out-of-band on testnet 2026-07-13):
  //   Which account's owner reserve increases on CredentialCreate — the
  //   subject or the issuer? Answer captured in the /tmp/reserve-impact-proof.mjs
  //   run and echoed into enrollment.ts's comment. Documenting here as a
  //   pinned expectation so a future changelog can flip it if the semantics
  //   ever change.
  //
  // Q2 (behavioral, tested here): when the mint fails — for ANY reason,
  // including subject being unfunded/below reserve — the enrollment record
  // must survive AND the response must surface the specific error string so
  // the caller can distinguish "silently no-op" from a specific failure.
  describe('reserve-impact failure surface', () => {
    beforeEach(() => { process.env.QR_ENROLLMENT_ENABLED = 'true'; });

    it('completes the session with credentialTxHash=null and credentialError populated when mint throws tecNO_TARGET (unfunded subject)', async () => {
      createCredentialMock.mockRejectedValueOnce(new Error('CredentialCreate failed: tecNO_TARGET'));
      await app.inject({
        method: 'POST', url: '/api/v1/enrollment/qr/session',
        payload: { merchantId: MERCHANT_ID }, headers: authHeader,
      });
      const res = await app.inject({
        method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
        payload: { xrplAddress: XRPL_ADDR }, headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('completed');
      expect(body.credentialTxHash).toBeNull();
      expect(body.credentialError).toContain('tecNO_TARGET');
      // Consent HCS write still happens — enrollment is authoritative in DB+HCS, not in the NFT.
      expect(body.hcsConsentSeqNumber).toBe(777);
    });

    it('completes the session with credentialError populated when mint throws tecINSUFFICIENT_RESERVE (issuer below reserve threshold)', async () => {
      createCredentialMock.mockRejectedValueOnce(new Error('CredentialCreate failed: tecINSUFFICIENT_RESERVE'));
      await app.inject({
        method: 'POST', url: '/api/v1/enrollment/qr/session',
        payload: { merchantId: MERCHANT_ID }, headers: authHeader,
      });
      const res = await app.inject({
        method: 'POST', url: `/api/v1/enrollment/qr/session/${sessionStore.id}/complete`,
        payload: { xrplAddress: XRPL_ADDR }, headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.credentialTxHash).toBeNull();
      expect(body.credentialError).toContain('tecINSUFFICIENT_RESERVE');
    });
  });
});
