import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  TransferService: {
    transferToken: jest.fn().mockResolvedValue(undefined),
    transferHbar: jest.fn().mockResolvedValue(undefined),
  },
  getClient: jest.fn(),
}));

// Manual mock at tests/__mocks__/xrpl-service.ts. Needed once we exercise
// CREDENTIAL_VERIFICATION_ENABLED — that code path calls verifyCredential.
jest.mock('@acquis/xrpl-service');
import * as xrplService from '@acquis/xrpl-service';
const verifyCredentialMock = xrplService.verifyCredential as jest.MockedFunction<typeof xrplService.verifyCredential>;

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

const ENV = {
  HEDERA_OPERATOR_ID: '0.0.11111',
  HEDERA_OPERATOR_KEY: 'mock-key',
  HEDERA_DEFAULT_TOKEN_ID: '0.0.99999',
};

describe('Pay route', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => { Object.assign(process.env, ENV); });

  it('POST /api/v1/pay returns 400 when toAccountId is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { amount: 10 }, headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/pay token mode uses HEDERA_DEFAULT_TOKEN_ID', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.tokenId).toBe('0.0.99999');
    expect(body.mode).toBe('token');
  });

  it('POST /api/v1/pay token mode accepts explicit tokenId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50, tokenId: '0.0.88888' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokenId).toBe('0.0.88888');
  });

  it('POST /api/v1/pay hbar mode does not return tokenId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 5, mode: 'hbar' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe('hbar');
    expect(body.tokenId).toBeUndefined();
  });

  it('POST /api/v1/pay returns 400 when no tokenId and none configured', async () => {
    const saved = process.env.HEDERA_DEFAULT_TOKEN_ID;
    delete process.env.HEDERA_DEFAULT_TOKEN_ID;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/pay',
      payload: { toAccountId: '0.0.22222', amount: 50 },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
    process.env.HEDERA_DEFAULT_TOKEN_ID = saved;
  });

  // ─── CREDENTIAL_VERIFICATION_ENABLED gate ─────────────────────────────────
  describe('credential verification gate', () => {
    beforeEach(() => {
      verifyCredentialMock.mockReset();
      delete process.env.CREDENTIAL_VERIFICATION_ENABLED;
    });

    it('skips verifyCredential when flag is unset (current default behavior)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50, customerXrplAddress: 'rSubject' },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(verifyCredentialMock).not.toHaveBeenCalled();
    });

    it('skips verifyCredential when flag is true BUT customerXrplAddress is not provided', async () => {
      process.env.CREDENTIAL_VERIFICATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50 },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(verifyCredentialMock).not.toHaveBeenCalled();
    });

    it('returns 403 with reason=not_found when flag is true and credential is invalid', async () => {
      process.env.CREDENTIAL_VERIFICATION_ENABLED = 'true';
      verifyCredentialMock.mockResolvedValueOnce({ valid: false, reason: 'not_found' });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50, customerXrplAddress: 'rSubject' },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(403);
      expect(verifyCredentialMock).toHaveBeenCalledWith({ accountAddress: 'rSubject' });
      expect(res.json().message).toMatch(/credential/i);
      expect(res.json().reason).toBe('not_found');
    });

    it('returns 503 with reason=issuer_not_configured when the server is misconfigured', async () => {
      process.env.CREDENTIAL_VERIFICATION_ENABLED = 'true';
      verifyCredentialMock.mockResolvedValueOnce({ valid: false, reason: 'issuer_not_configured' });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50, customerXrplAddress: 'rSubject' },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().reason).toBe('issuer_not_configured');
      expect(res.json().message).toMatch(/XRPL_CREDENTIAL_ISSUER_ADDRESS/);
    });

    it('proceeds with payment when flag is true AND credential is valid', async () => {
      process.env.CREDENTIAL_VERIFICATION_ENABLED = 'true';
      verifyCredentialMock.mockResolvedValueOnce({
        valid: true,
        credential: {
          issuer: 'rIssuer', subject: 'rSubject',
          credential_type: 'AcquisMember', uri: 'hedera:0.0.9342217/1',
        },
      });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50, customerXrplAddress: 'rSubject' },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.credentialVerified).toBe(true);
    });
  });

  // ─── Enforcement engine gate (Component D) ───────────────────────────────
  describe('enforcement engine gate', () => {
    beforeEach(() => { delete process.env.ENFORCEMENT_ENGINE_ENABLED; });

    it('ENFORCEMENT_ENGINE_ENABLED=false — existing payment flow completely unchanged', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50 },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
    });

    it('ENFORCEMENT_ENGINE_ENABLED=true without merchantId/customerId → 400', async () => {
      process.env.ENFORCEMENT_ENGINE_ENABLED = 'true';
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { toAccountId: '0.0.22222', amount: 50 },
        headers: authHeader,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/merchantId and customerId/);
    });

    // Approved / rejected pass-through behaviors are covered exhaustively
    // by tests/enforcement/stubAdapter.test.ts and by the live testnet
    // demonstration.
  });
});
