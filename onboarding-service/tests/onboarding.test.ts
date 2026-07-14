// Tests cover the onboarding service layer directly (not HTTP routes) to avoid
// loading fastify (~180s iCloud eviction time) in CI.
// The route handlers are thin pass-throughs with no business logic.

import {
  createSession,
  startIDV,
  completeIDV,
  startBankLink,
  completeBankLink,
  recordConsent,
  getSessionStatus,
} from '../src/services/onboarding.service';
import { CONSENT_TEXT } from '../src/services/hcs-consent';

// ---- DB mock: fns defined inside factory to avoid jest.mock() hoisting TDZ ----
jest.mock('../src/db', () => ({
  prisma: {
    onboardingSession: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// ---- Plaid service mock ----
jest.mock('../src/services/plaid.service', () => ({
  createIDVSession: jest.fn(),
  getIDVResult: jest.fn(),
  isIDVSuccess: jest.fn(),
  createLinkToken: jest.fn(),
  exchangePublicToken: jest.fn(),
}));

// ---- HCS consent mock — keep real CONSENT_TEXT via requireActual ----
jest.mock('../src/services/hcs-consent', () => {
  const actual = jest.requireActual('../src/services/hcs-consent') as { CONSENT_TEXT: string };
  return {
    CONSENT_TEXT: actual.CONSENT_TEXT,
    writeConsentToHCS: jest.fn(),
  };
});

// Typed references to mocked modules, resolved after jest.mock() registration
function getDb() {
  const mod = jest.requireMock('../src/db') as {
    prisma: {
      onboardingSession: {
        create: jest.Mock;
        findUniqueOrThrow: jest.Mock;
        update: jest.Mock;
      };
    };
  };
  return mod.prisma.onboardingSession;
}

function getPlaid() {
  return jest.requireMock('../src/services/plaid.service') as {
    createIDVSession: jest.Mock;
    getIDVResult: jest.Mock;
    isIDVSuccess: jest.Mock;
    createLinkToken: jest.Mock;
    exchangePublicToken: jest.Mock;
  };
}

function getHcs() {
  return jest.requireMock('../src/services/hcs-consent') as {
    writeConsentToHCS: jest.Mock;
  };
}

const baseSession = {
  id: 'db-id-001',
  session_id: 'sess-001',
  email: 'test@example.com',
  phone: null,
  idv_status: 'pending',
  bank_link_status: 'pending',
  consent_status: 'pending',
  credential_status: 'pending',
  acquis_id: null,
  xrpl_address: null,
  legal_name: null,
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
};

// Default fetch mock — overridden per-test where needed
const fetchMock = jest.fn();
global.fetch = fetchMock;

describe('onboarding service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        hedera_nft_token_id: '0.0.9199123',
        hedera_nft_serial: 1,
        xrpl_credential_tx_hash: 'stub-credential-tx',
        status: 'pending_acceptance',
      }),
    });

    const db = getDb();
    db.create.mockResolvedValue(baseSession);
    db.findUniqueOrThrow.mockResolvedValue({ ...baseSession });
    db.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...baseSession, ...data }),
    );

    const plaid = getPlaid();
    plaid.createIDVSession.mockResolvedValue({
      idv_id: 'idv-sandbox-001',
      shareable_url: 'https://sandbox.plaid.com/verify/idv-sandbox-001',
      status: 'active',
    });
    plaid.getIDVResult.mockResolvedValue({
      status: 'success',
      legal_name: 'Jane Doe',
      date_of_birth: '1990-01-15',
      address_city: 'Austin',
      address_region: 'TX',
      address_postal: '78701',
      documentary_status: 'success',
      selfie_status: 'success',
    });
    plaid.isIDVSuccess.mockReturnValue(true);
    plaid.createLinkToken.mockResolvedValue({
      link_token: 'link-sandbox-abc123',
      expiration: '2026-07-01T00:00:00Z',
    });
    plaid.exchangePublicToken.mockResolvedValue({
      item_id: 'item-sandbox-001',
      account_mask: '0000',
      account_type: 'checking',
      institution_name: 'ins_109508',
      identity_match_status: 'match',
      identity_match_score: 95,
    });

    getHcs().writeConsentToHCS.mockResolvedValue({
      hcs_topic_id: '0.0.stub',
      hcs_sequence_num: 0,
      hcs_timestamp: '2026-06-25T00:00:00.000Z',
      hcs_transaction_id: 'stub-sess-001',
    });
  });

  // --- session creation ---
  it('createSession creates a DB record and returns a UUID session_id', async () => {
    const result = await createSession('test@example.com');
    expect(typeof result.session_id).toBe('string');
    const db = getDb();
    expect(db.create).toHaveBeenCalledTimes(1);
    const createArg = db.create.mock.calls[0][0];
    expect(createArg.data.email).toBe('test@example.com');
    expect(createArg.data.expires_at).toBeInstanceOf(Date);
  });

  it('createSession stores phone when provided', async () => {
    await createSession('test@example.com', '+15125550001');
    const createArg = getDb().create.mock.calls[0][0];
    expect(createArg.data.phone).toBe('+15125550001');
  });

  // --- session status ---
  it('getSessionStatus returns status fields for an active session', async () => {
    const status = await getSessionStatus('sess-001');
    expect(status.session_id).toBe('sess-001');
    expect(status.idv_status).toBe('pending');
    expect(status.bank_link_status).toBe('pending');
    expect(status.consent_status).toBe('pending');
  });

  it('getSessionStatus throws SESSION_EXPIRED for an expired session', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      expires_at: new Date(Date.now() - 1000),
    });
    await expect(getSessionStatus('sess-001')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  // --- IDV ---
  it('startIDV calls createIDVSession and sets status to in_progress', async () => {
    const result = await startIDV('sess-001');
    expect(result.shareable_url).toContain('plaid.com');
    expect(getDb().update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idv_status: 'in_progress' }) }),
    );
  });

  it('completeIDV marks completed and stores legal_name', async () => {
    const result = await completeIDV('sess-001', 'idv-sandbox-001');
    expect(result.status).toBe('completed');
    expect(getDb().update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idv_status: 'completed',
          legal_name: 'Jane Doe',
          address_city: 'Austin',
        }),
      }),
    );
  });

  // --- bank link step order ---
  it('startBankLink throws STEP_ORDER if IDV not completed', async () => {
    await expect(startBankLink('sess-001')).rejects.toMatchObject({ code: 'STEP_ORDER' });
  });

  it('startBankLink returns link_token when IDV is completed', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({ ...baseSession, idv_status: 'completed' });
    const result = await startBankLink('sess-001');
    expect(result.link_token).toBe('link-sandbox-abc123');
  });

  it('completeBankLink writes item_id and never stores Plaid access_token', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      idv_status: 'completed',
      legal_name: 'Jane Doe',
    });
    await completeBankLink('sess-001', 'public-sandbox-abc');
    const updateCall = getDb().update.mock.calls[0][0];
    expect(updateCall.data.plaid_item_id).toBe('item-sandbox-001');
    expect(updateCall.data.bank_link_status).toBe('completed');
    expect(JSON.stringify(updateCall)).not.toContain('access_token');
  });

  // --- consent step order ---
  it('recordConsent throws STEP_ORDER if bank link not completed', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      idv_status: 'completed',
      bank_link_status: 'pending',
    });
    await expect(recordConsent('sess-001')).rejects.toMatchObject({ code: 'STEP_ORDER' });
  });

  it('recordConsent completes consent and assigns acquis_id as ACQ-<session.id>', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      idv_status: 'completed',
      bank_link_status: 'completed',
    });
    const result = await recordConsent('sess-001');
    expect(result.hcs_topic_id).toBe('0.0.stub');
    const updateCall = getDb().update.mock.calls[0][0];
    expect(updateCall.data.consent_status).toBe('completed');
    expect(updateCall.data.acquis_id).toBe('ACQ-db-id-001');
  });

  // --- credential enrollment (non-blocking follow-up to consent) ---
  it('consent confirmation triggers credential enrollment with correct payload', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      idv_status: 'completed',
      bank_link_status: 'completed',
    });
    await recordConsent('sess-001');
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/credentials/enroll'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"acquis_id":"ACQ-db-id-001"'),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.tier).toBe('starter');
    expect(body.xrpl_address).toMatch(/^xrpl-pending-/);

    const credentialUpdate = getDb().update.mock.calls[1][0];
    expect(credentialUpdate.data.credential_status).toBe('active');
    expect(credentialUpdate.data.hedera_nft_token_id).toBe('0.0.9199123');
    expect(credentialUpdate.data.hedera_nft_serial).toBe(1);
    expect(credentialUpdate.data.xrpl_credential_tx).toBe('stub-credential-tx');
  });

  it('consent confirmation succeeds even if credential enrollment fails', async () => {
    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession,
      idv_status: 'completed',
      bank_link_status: 'completed',
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    const result = await recordConsent('sess-001');
    expect(result.hcs_topic_id).toBe('0.0.stub');

    await new Promise<void>(resolve => setImmediate(resolve));

    const credentialUpdate = getDb().update.mock.calls[1][0];
    expect(credentialUpdate.data.credential_status).toBe('failed');
  });

  // --- HCS write ordering (HCS must complete before credential enrollment fires) ---
  it('HCS write is called before credential enrollment', async () => {
    const callOrder: string[] = [];
    getHcs().writeConsentToHCS.mockImplementationOnce(async () => {
      callOrder.push('hcs');
      return { hcs_topic_id: '0.0.9342744', hcs_sequence_num: 1, hcs_timestamp: '2026-06-29T12:00:00.000Z', hcs_transaction_id: '0.0.9186941@0.0' };
    });
    fetchMock.mockImplementationOnce(async () => {
      callOrder.push('credential');
      return { ok: true, json: async () => ({ hedera_nft_token_id: '0.0.9199123', hedera_nft_serial: 1, xrpl_credential_tx_hash: 'tx' }) };
    });

    getDb().findUniqueOrThrow.mockResolvedValueOnce({
      ...baseSession, idv_status: 'completed', bank_link_status: 'completed',
    });

    await recordConsent('sess-001');
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(callOrder[0]).toBe('hcs');
    expect(callOrder[1]).toBe('credential');
  });

  // --- CONSENT_TEXT integrity (legally required verbatim check) ---
  it('CONSENT_TEXT matches the legally required verbatim text', () => {
    const expected =
      'By continuing, you authorize Acquis to:\n' +
      '- Verify your identity using the information provided\n' +
      '- Access your linked bank account for payment processing under your standing approval authorization\n' +
      '- Store a permanent record of your consent on the Hedera public ledger (immutable, timestamped, publicly verifiable)\n' +
      '- Issue you a digital membership credential on Hedera and the XRP Ledger to authorize payments at Acquis merchants\n\n' +
      'This enrollment constitutes your Customer Identification record under the Bank Secrecy Act. ' +
      'Acquis is registered with FinCEN as a Money Services Business (prepaid access provider).';
    expect(CONSENT_TEXT).toBe(expected);
  });
});
