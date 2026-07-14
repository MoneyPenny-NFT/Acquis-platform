// xrpl.js ships both src/*.ts and dist/npm/*.js — ts-jest walks into src/ and
// crashes on @xrplf/isomorphic's nested @noble/hashes ESM. Mocking the module
// at the boundary keeps the credential.ts unit tests hermetic and fast; the
// real xrpl.js behavior is proven separately by the live testnet lifecycle
// script (see /tmp/credential-testnet-e2e.mjs on the last DONE run).
jest.mock('xrpl', () => {
  const walletFromSeed = jest.fn((seed: string) => {
    // Deterministic fake addresses keyed by seed so tests can assert which
    // wallet signed which transaction.
    const bySeed: Record<string, string> = {
      sEd7WuAk1rU3i8niFCkTKZB8TZ7MqXg: 'rU2gCTb79SLxAaGPQkc5RYcAwzfhr4yLLq',
      sEd79zfY7Kjs6KNvUaSLLCyTZ651kLq: 'raGuDLSziK7KdbeNDnYKBVFqAXfU91Cfya',
    };
    return { address: bySeed[seed] ?? `rFAKE_${seed.slice(-6)}`, publicKey: 'FAKE', privateKey: 'FAKE' };
  });
  return { Wallet: { fromSeed: walletFromSeed } };
});

import {
  createCredential,
  acceptCredential,
  deleteCredential,
  configureMerchantPreauth,
  verifyCredential,
  toRippleEpoch,
  nowRippleEpoch,
} from '../src/services/credential';

jest.mock('../src/client', () => ({
  getXrplClient: jest.fn(),
}));

import { getXrplClient } from '../src/client';
const mockGetXrplClient = getXrplClient as jest.MockedFunction<typeof getXrplClient>;

const ISSUER          = 'rU2gCTb79SLxAaGPQkc5RYcAwzfhr4yLLq';
const ISSUER_SEED     = 'sEd7WuAk1rU3i8niFCkTKZB8TZ7MqXg';
const SUBJECT         = 'raGuDLSziK7KdbeNDnYKBVFqAXfU91Cfya';
const SUBJECT_SEED    = 'sEd79zfY7Kjs6KNvUaSLLCyTZ651kLq';
const CREDENTIAL_TYPE_HEX = Buffer.from('AcquisMember', 'utf8').toString('hex').toUpperCase();

function mockClient(submitAndWaitReturn: Record<string, unknown>) {
  return {
    submitAndWait: jest.fn().mockResolvedValue(submitAndWaitReturn),
    request:       jest.fn(),
  } as unknown as Awaited<ReturnType<typeof getXrplClient>>;
}

function successResult(hash: string) {
  return {
    result: {
      hash,
      meta: { TransactionResult: 'tesSUCCESS' },
      validated: true,
    },
  };
}

function failureResult(code: string) {
  return {
    result: {
      hash: 'FAILEDHASH',
      meta: { TransactionResult: code },
      validated: true,
    },
  };
}

beforeEach(() => {
  process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS = ISSUER;
  process.env.XRPL_CREDENTIAL_ISSUER_SEED    = ISSUER_SEED;
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS;
  delete process.env.XRPL_CREDENTIAL_ISSUER_SEED;
  delete process.env.XRPL_MERCHANT_SEED;
});

describe('createCredential', () => {
  it('submits a CredentialCreate signed by the issuer and returns tx hash + composite id', async () => {
    const client = mockClient(successResult('CREATEHASH'));
    mockGetXrplClient.mockResolvedValue(client);

    const result = await createCredential({
      subjectAddress:   SUBJECT,
      hederaNftTokenId: '0.0.9199123',
      hederaNftSerial:  1,
    });

    expect(result.txHash).toBe('CREATEHASH');
    expect(result.credentialId).toBe(`${ISSUER}:${SUBJECT}:${CREDENTIAL_TYPE_HEX}`);

    const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    const [tx] = submitAndWait.mock.calls[0];
    expect(tx.TransactionType).toBe('CredentialCreate');
    expect(tx.Account).toBe(ISSUER);
    expect(tx.Subject).toBe(SUBJECT);
    expect(tx.CredentialType).toBe(CREDENTIAL_TYPE_HEX);
    // URI is hex-encoded "hedera:0.0.9199123/1"
    expect(tx.URI).toBe(Buffer.from('hedera:0.0.9199123/1', 'utf8').toString('hex').toUpperCase());
  });

  it('throws when tesSUCCESS is not returned', async () => {
    mockGetXrplClient.mockResolvedValue(mockClient(failureResult('tecNO_PERMISSION')));
    await expect(createCredential({
      subjectAddress:   SUBJECT,
      hederaNftTokenId: '0.0.9199123',
      hederaNftSerial:  1,
    })).rejects.toThrow(/CredentialCreate failed: tecNO_PERMISSION/);
  });

  it('falls back from XRPL_CREDENTIAL_ISSUER_SEED to XRPL_MERCHANT_SEED when former is unset', async () => {
    delete process.env.XRPL_CREDENTIAL_ISSUER_SEED;
    process.env.XRPL_MERCHANT_SEED = ISSUER_SEED;
    mockGetXrplClient.mockResolvedValue(mockClient(successResult('FALLBACKHASH')));

    const result = await createCredential({
      subjectAddress:   SUBJECT,
      hederaNftTokenId: '0.0.9199123',
      hederaNftSerial:  1,
    });
    expect(result.txHash).toBe('FALLBACKHASH');
  });

  it('throws when neither issuer seed nor merchant-seed fallback is set', async () => {
    delete process.env.XRPL_CREDENTIAL_ISSUER_SEED;
    delete process.env.XRPL_MERCHANT_SEED;
    await expect(createCredential({
      subjectAddress:   SUBJECT,
      hederaNftTokenId: '0.0.9199123',
      hederaNftSerial:  1,
    })).rejects.toThrow(/XRPL_CREDENTIAL_ISSUER_SEED/);
  });
});

describe('acceptCredential', () => {
  it('submits a CredentialAccept signed by the subject', async () => {
    const client = mockClient(successResult('ACCEPTHASH'));
    mockGetXrplClient.mockResolvedValue(client);

    const result = await acceptCredential({
      subjectSeed:    SUBJECT_SEED,
      issuerAddress:  ISSUER,
      credentialType: 'AcquisMember',
    });

    expect(result.txHash).toBe('ACCEPTHASH');
    const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
    const [tx, opts] = submitAndWait.mock.calls[0];
    expect(tx.TransactionType).toBe('CredentialAccept');
    expect(tx.Account).toBe(SUBJECT);
    expect(tx.Issuer).toBe(ISSUER);
    expect(tx.CredentialType).toBe(CREDENTIAL_TYPE_HEX);
    // Wallet passed in opts derives from SUBJECT_SEED — verify by address
    expect(opts.wallet.address).toBe(SUBJECT);
  });

  it('throws without subjectSeed', async () => {
    await expect(acceptCredential({
      subjectSeed:    '',
      issuerAddress:  ISSUER,
      credentialType: 'AcquisMember',
    })).rejects.toThrow(/subjectSeed is required/);
  });
});

describe('deleteCredential', () => {
  it('submits a CredentialDelete signed by the issuer', async () => {
    const client = mockClient(successResult('DELETEHASH'));
    mockGetXrplClient.mockResolvedValue(client);

    const result = await deleteCredential({
      subjectAddress: SUBJECT,
      credentialType: 'AcquisMember',
    });

    expect(result.txHash).toBe('DELETEHASH');
    const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
    const [tx] = submitAndWait.mock.calls[0];
    expect(tx.TransactionType).toBe('CredentialDelete');
    expect(tx.Account).toBe(ISSUER);
    expect(tx.Subject).toBe(SUBJECT);
    expect(tx.CredentialType).toBe(CREDENTIAL_TYPE_HEX);
  });

  it('throws when tesSUCCESS is not returned', async () => {
    mockGetXrplClient.mockResolvedValue(mockClient(failureResult('tecNO_ENTRY')));
    await expect(deleteCredential({
      subjectAddress: SUBJECT,
      credentialType: 'AcquisMember',
    })).rejects.toThrow(/CredentialDelete failed: tecNO_ENTRY/);
  });
});

describe('configureMerchantPreauth', () => {
  it('submits a DepositPreauth with AuthorizeCredentials signed by the merchant', async () => {
    const client = mockClient(successResult('PREAUTHHASH'));
    mockGetXrplClient.mockResolvedValue(client);

    const result = await configureMerchantPreauth({
      merchantAddress: ISSUER,
      merchantSeed:    ISSUER_SEED,
    });

    expect(result.txHash).toBe('PREAUTHHASH');
    const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
    const [tx] = submitAndWait.mock.calls[0];
    expect(tx.TransactionType).toBe('DepositPreauth');
    expect(tx.Account).toBe(ISSUER);
    expect(tx.AuthorizeCredentials).toEqual([
      { Credential: { Issuer: ISSUER, CredentialType: CREDENTIAL_TYPE_HEX } },
    ]);
  });

  it('throws without merchantSeed', async () => {
    await expect(configureMerchantPreauth({
      merchantAddress: ISSUER,
      merchantSeed:    '',
    })).rejects.toThrow(/merchantSeed is required/);
  });

  it('throws when XRPL_CREDENTIAL_ISSUER_ADDRESS is not set', async () => {
    delete process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS;
    await expect(configureMerchantPreauth({
      merchantAddress: ISSUER,
      merchantSeed:    ISSUER_SEED,
    })).rejects.toThrow(/XRPL_CREDENTIAL_ISSUER_ADDRESS/);
  });
});

describe('verifyCredential', () => {
  it('returns valid: true when ledger_entry returns a credential node', async () => {
    const uriHex = Buffer.from('hedera:0.0.9199123/1', 'utf8').toString('hex').toUpperCase();
    mockGetXrplClient.mockResolvedValue({
      request: jest.fn().mockResolvedValue({
        result: { node: { URI: uriHex, LedgerEntryType: 'Credential' } },
      }),
    } as unknown as Awaited<ReturnType<typeof getXrplClient>>);

    const result = await verifyCredential({ accountAddress: SUBJECT });
    expect(result.valid).toBe(true);
    expect(result.credential?.issuer).toBe(ISSUER);
    expect(result.credential?.uri).toBe('hedera:0.0.9199123/1');
  });

  it('returns valid: false + reason: not_found when ledger_entry returns entryNotFound (real xrpl.js error shape)', async () => {
    // Real rippled response shape observed on testnet 2026-07-13:
    //   err.message === 'Entry not found.' (human-readable)
    //   err.data.error === 'entryNotFound' (wire error code)
    const notFoundErr = Object.assign(new Error('Entry not found.'), {
      data: { error: 'entryNotFound' },
    });
    mockGetXrplClient.mockResolvedValue({
      request: jest.fn().mockRejectedValue(notFoundErr),
    } as unknown as Awaited<ReturnType<typeof getXrplClient>>);

    const result = await verifyCredential({ accountAddress: SUBJECT });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('returns valid: false + reason: issuer_not_configured when XRPL_CREDENTIAL_ISSUER_ADDRESS is unset', async () => {
    delete process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS;
    const result = await verifyCredential({ accountAddress: SUBJECT });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('issuer_not_configured');
  });
});

// ─── Item 1: Credential Expiration ────────────────────────────────────────
describe('credential expiration', () => {
  const UNIX_2000_01_01 = 946_684_800;

  describe('toRippleEpoch helper', () => {
    it('converts a JS Date to seconds since 2000-01-01Z', () => {
      const d = new Date('2030-01-01T00:00:00Z');
      const rippleEpoch = toRippleEpoch(d);
      const expected = Math.floor(d.getTime() / 1000) - UNIX_2000_01_01;
      expect(rippleEpoch).toBe(expected);
    });

    it('converts an ISO string to seconds since 2000-01-01Z', () => {
      const rippleEpoch = toRippleEpoch('2030-01-01T00:00:00Z');
      const expected = Math.floor(new Date('2030-01-01T00:00:00Z').getTime() / 1000) - UNIX_2000_01_01;
      expect(rippleEpoch).toBe(expected);
    });

    it('passes through a value already in Ripple Epoch range', () => {
      // 946684800 is unix Jan 1 2000 → treated as Unix (auto-converted to 0 ripple)
      // A "small" number like 1000 is already ripple-epoch and passes through
      expect(toRippleEpoch(1000)).toBe(1000);
    });
  });

  describe('createCredential', () => {
    it('sets Expiration on the tx when expiresAt is provided (Date)', async () => {
      const client = mockClient(successResult('CREATEEXPHASH'));
      mockGetXrplClient.mockResolvedValue(client);
      const expiresAt = new Date('2030-06-15T12:00:00Z');

      await createCredential({
        subjectAddress:   SUBJECT,
        hederaNftTokenId: '0.0.9199123',
        hederaNftSerial:  1,
        expiresAt,
      });

      const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
      const [tx] = submitAndWait.mock.calls[0];
      expect(tx.Expiration).toBe(toRippleEpoch(expiresAt));
    });

    it('accepts an ISO string for expiresAt', async () => {
      const client = mockClient(successResult('CREATEISOEXPHASH'));
      mockGetXrplClient.mockResolvedValue(client);
      const iso = '2030-06-15T12:00:00Z';

      await createCredential({
        subjectAddress:   SUBJECT,
        hederaNftTokenId: '0.0.9199123',
        hederaNftSerial:  1,
        expiresAt: iso,
      });

      const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
      const [tx] = submitAndWait.mock.calls[0];
      expect(tx.Expiration).toBe(toRippleEpoch(iso));
    });

    it('omits Expiration entirely when expiresAt is not provided (perpetual, unchanged behavior)', async () => {
      const client = mockClient(successResult('CREATENOEXPHASH'));
      mockGetXrplClient.mockResolvedValue(client);

      await createCredential({
        subjectAddress:   SUBJECT,
        hederaNftTokenId: '0.0.9199123',
        hederaNftSerial:  1,
      });

      const submitAndWait = (client as unknown as { submitAndWait: jest.Mock }).submitAndWait;
      const [tx] = submitAndWait.mock.calls[0];
      expect('Expiration' in tx).toBe(false);
    });
  });

  describe('verifyCredential', () => {
    it('returns valid: true when Expiration is in the future', async () => {
      const futureRippleEpoch = nowRippleEpoch() + 3600; // +1 hour
      const uriHex = Buffer.from('hedera:0.0.9199123/1', 'utf8').toString('hex').toUpperCase();
      mockGetXrplClient.mockResolvedValue({
        request: jest.fn().mockResolvedValue({
          result: { node: { URI: uriHex, Expiration: futureRippleEpoch, LedgerEntryType: 'Credential' } },
        }),
      } as unknown as Awaited<ReturnType<typeof getXrplClient>>);

      const result = await verifyCredential({ accountAddress: SUBJECT });
      expect(result.valid).toBe(true);
      expect(result.credential?.expiration).toBe(futureRippleEpoch);
    });

    it('returns valid: false + reason: expired when Expiration is in the past', async () => {
      const pastRippleEpoch = nowRippleEpoch() - 60; // 1 minute ago
      const uriHex = Buffer.from('hedera:0.0.9199123/1', 'utf8').toString('hex').toUpperCase();
      mockGetXrplClient.mockResolvedValue({
        request: jest.fn().mockResolvedValue({
          result: { node: { URI: uriHex, Expiration: pastRippleEpoch, LedgerEntryType: 'Credential' } },
        }),
      } as unknown as Awaited<ReturnType<typeof getXrplClient>>);

      const result = await verifyCredential({ accountAddress: SUBJECT });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
      // Still return the credential body so callers can see WHY it's expired
      expect(result.credential?.expiration).toBe(pastRippleEpoch);
      expect(result.credential?.uri).toBe('hedera:0.0.9199123/1');
    });

    it('returns valid: true (no reason) when the credential node has no Expiration field (perpetual)', async () => {
      const uriHex = Buffer.from('hedera:0.0.9199123/1', 'utf8').toString('hex').toUpperCase();
      mockGetXrplClient.mockResolvedValue({
        request: jest.fn().mockResolvedValue({
          result: { node: { URI: uriHex, LedgerEntryType: 'Credential' } }, // no Expiration
        }),
      } as unknown as Awaited<ReturnType<typeof getXrplClient>>);

      const result = await verifyCredential({ accountAddress: SUBJECT });
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.credential?.expiration).toBeUndefined();
    });
  });
});
