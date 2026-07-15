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

// x402-xrpl + xrpl are moduleNameMapper'd to their manual mocks at
// tests/__mocks__/x402-xrpl.ts and tests/__mocks__/xrpl.ts (jest.config.js).
// The xrpl mock is a global load-time shim (all suites need it because pay.ts
// imports { Wallet } from 'xrpl' and ts-jest cannot parse xrpl.js source).
// x402-xrpl is exercised only under X402_ENABLED=true in this file.
import { resetX402Mocks, verifyMock, settleMock, preparePaymentMock, encodePaymentRequiredHeaderMock } from '../__mocks__/x402-xrpl';

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

  // ─── x402 branch — X402_ENABLED flag + facilitator flow ─────────────────
  describe('x402 mode', () => {
    beforeEach(() => {
      resetX402Mocks();
      delete process.env.X402_ENABLED;
      delete process.env.ENFORCEMENT_ENGINE_ENABLED;
      delete process.env.CREDENTIAL_VERIFICATION_ENABLED;
      process.env.XRPL_MERCHANT_ADDRESS = 'rMerchantAddr';
      process.env.XRPL_CUSTOMER_SEED    = 'sEdMockSeed';
      process.env.XRPL_XRP_USD_RATE     = '2.50';
      process.env.X402_FACILITATOR_URL  = 'https://xrpl-facilitator-testnet.t54.ai';
    });

    it('X402_ENABLED unset → legacy stub path is used (no facilitator call)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe('x402');
      expect(body.x402Details?.version).toBe('x402/v1');
      expect(body).not.toHaveProperty('settlementResponse');
      expect(verifyMock).not.toHaveBeenCalled();
      expect(settleMock).not.toHaveBeenCalled();
    });

    it('X402_ENABLED=true → verify + settle happy path returns settlementResponse', async () => {
      process.env.X402_ENABLED = 'true';
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 250 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.mode).toBe('x402');
      expect(body.settlementResponse.success).toBe(true);
      expect(body.settlementResponse.transaction).toBe('MOCKX402TXHASH1234567890');
      expect(body.paymentRequirements.scheme).toBe('exact');
      expect(body.paymentRequirements.network).toBe('xrpl:1');
      expect(body.paymentRequirements.asset).toBe('XRP');
      expect(body.paymentRequirements.payTo).toBe('rMerchantAddr');
      expect(preparePaymentMock).toHaveBeenCalledTimes(1);
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(settleMock).toHaveBeenCalledTimes(1);
      // The old smartnodeValidated field should not appear on x402 responses
      expect(body).not.toHaveProperty('smartnodeValidated');
    });

    it('X402_ENABLED=true with X402_FACILITATOR_URL unset → 503 facilitator_not_configured', async () => {
      process.env.X402_ENABLED = 'true';
      delete process.env.X402_FACILITATOR_URL;
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().reason).toBe('facilitator_not_configured');
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('facilitator /verify returns isValid=false → 400 with PAYMENT-REQUIRED response header', async () => {
      process.env.X402_ENABLED = 'true';
      verifyMock.mockResolvedValueOnce({ isValid: false, invalidReason: 'amount_mismatch' });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().reason).toBe('payment_verify_failed');
      expect(res.json().invalidReason).toBe('amount_mismatch');
      expect(res.headers['payment-required']).toBe('BASE64_MOCK_PAYMENT_REQUIRED_HEADER');
      expect(encodePaymentRequiredHeaderMock).toHaveBeenCalledTimes(1);
      expect(settleMock).not.toHaveBeenCalled();
    });

    it('facilitator /settle returns success=false → 502 settle_failed', async () => {
      process.env.X402_ENABLED = 'true';
      settleMock.mockResolvedValueOnce({
        success: false, transaction: '', network: 'xrpl:1',
        errorReason: 'tecDST_TAG_NEEDED',
      });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().reason).toBe('settle_failed');
      expect(res.json().errorReason).toBe('tecDST_TAG_NEEDED');
    });

    it('facilitator /verify throws (unreachable) → 502 facilitator_unreachable', async () => {
      process.env.X402_ENABLED = 'true';
      verifyMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().reason).toBe('facilitator_unreachable');
      expect(settleMock).not.toHaveBeenCalled();
    });

    it('enforcement rejects before any facilitator round-trip is attempted', async () => {
      process.env.X402_ENABLED = 'true';
      process.env.ENFORCEMENT_ENGINE_ENABLED = 'true';
      // Without merchantId/customerId the enforcement gate returns 400 up-front.
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/merchantId and customerId/);
      // Critical: the facilitator was never contacted.
      expect(preparePaymentMock).not.toHaveBeenCalled();
      expect(verifyMock).not.toHaveBeenCalled();
      expect(settleMock).not.toHaveBeenCalled();
    });

    it('X402_ENABLED=true without XRPL creds → 503 xrpl_not_configured (before any facilitator call)', async () => {
      process.env.X402_ENABLED = 'true';
      delete process.env.XRPL_MERCHANT_ADDRESS;
      const res = await app.inject({
        method: 'POST', url: '/api/v1/pay',
        payload: { mode: 'x402', amountCents: 100 }, headers: authHeader,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().message).toMatch(/XRPL credentials/);
      expect(preparePaymentMock).not.toHaveBeenCalled();
    });
  });
});
