import { Wallet } from 'xrpl';
import type {
  CredentialCreate,
  CredentialAccept,
  CredentialDelete,
  DepositPreauth,
} from 'xrpl';
import { getXrplClient } from '../client';

export interface AcquisXRPLCredential {
  issuer: string;
  subject: string;
  credential_type: 'AcquisMember';
  uri: string;
  expiration?: number;
}

export interface CreateCredentialParams {
  subjectAddress: string;
  hederaNftTokenId: string;
  hederaNftSerial: number;
  // Optional expiration — accepts a JS Date, an ISO 8601 string, or a Ripple
  // Epoch integer (seconds since 2000-01-01T00:00:00Z UTC). Converted to
  // Ripple Epoch internally before being set as CredentialCreate.Expiration.
  // Omit for a perpetual credential (behavior unchanged from before).
  expiresAt?: Date | string | number;
}

export interface CreateCredentialResult {
  txHash: string;
  credentialId: string;
}

export interface AcceptCredentialParams {
  subjectSeed:    string;
  issuerAddress:  string;
  credentialType: string;
}

export interface DeleteCredentialParams {
  subjectAddress: string;
  credentialType: string;
}

export interface ConfigureMerchantPreauthParams {
  merchantAddress: string;
  merchantSeed:    string;
}

// Distinguishes WHY verifyCredential returned valid:false, so a misconfigured
// server ('issuer_not_configured') doesn't look identical to a legitimately
// revoked credential ('not_found') to the caller. Absent when valid:true.
// 'expired' means the credential entry exists on-ledger but its Expiration
// field is in the past — distinct from 'not_found' (nothing on-ledger) and
// from 'issuer_not_configured' (server config error).
export type VerifyCredentialFailureReason = 'issuer_not_configured' | 'not_found' | 'expired';

export interface VerifyCredentialResult {
  valid:       boolean;
  reason?:     VerifyCredentialFailureReason;
  credential?: AcquisXRPLCredential;
}

const CREDENTIAL_TYPE_HEX = Buffer.from('AcquisMember', 'utf8').toString('hex').toUpperCase();

// XRPL "Ripple Epoch" starts at 2000-01-01T00:00:00Z UTC — offset 946684800
// seconds from Unix epoch. All ledger timestamps (tx close_time, Expiration
// fields, etc.) are seconds-since-Ripple-Epoch. Convert both directions
// through this pair of helpers.
const RIPPLE_EPOCH_OFFSET_SEC = 946_684_800;

// Accepts a Date, ISO string, Ripple Epoch integer, or Unix Epoch integer
// (auto-detected: > RIPPLE_EPOCH_OFFSET_SEC is treated as Unix). Returns
// Ripple Epoch seconds as an integer.
export function toRippleEpoch(input: Date | string | number): number {
  if (input instanceof Date) {
    return Math.floor(input.getTime() / 1000) - RIPPLE_EPOCH_OFFSET_SEC;
  }
  if (typeof input === 'string') {
    return Math.floor(new Date(input).getTime() / 1000) - RIPPLE_EPOCH_OFFSET_SEC;
  }
  // number: heuristic — if the value looks like a Unix timestamp (post-2001),
  // convert; otherwise assume caller already provided Ripple Epoch seconds.
  return input > RIPPLE_EPOCH_OFFSET_SEC ? input - RIPPLE_EPOCH_OFFSET_SEC : input;
}

// Returns "now" in Ripple Epoch seconds. Uses wall-clock, which is a close
// approximation of ledger close time (typically within 5 seconds on XRPL) —
// good enough for expiration checks; if a tighter bound is needed, query
// `server_info` for validated_ledger.close_time and use that instead.
export function nowRippleEpoch(): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET_SEC;
}

// Load the issuer's signing wallet. XRPL_CREDENTIAL_ISSUER_SEED is the primary source;
// falls back to XRPL_MERCHANT_SEED for dev environments where merchant == issuer.
function getIssuerWallet(): Wallet {
  const seed = process.env.XRPL_CREDENTIAL_ISSUER_SEED ?? process.env.XRPL_MERCHANT_SEED;
  if (!seed) {
    throw new Error('XRPL_CREDENTIAL_ISSUER_SEED (or XRPL_MERCHANT_SEED as fallback) must be set');
  }
  return Wallet.fromSeed(seed);
}

function assertTxSuccess(result: { result: { meta?: unknown } }, txType: string): void {
  const meta = result.result.meta;
  if (meta && typeof meta !== 'string') {
    const code = (meta as { TransactionResult?: string }).TransactionResult;
    if (code && code !== 'tesSUCCESS') {
      throw new Error(`${txType} failed: ${code}`);
    }
  }
}

// Issuer submits a CredentialCreate. The credential lands on the ledger immediately
// but is flagged pending acceptance until the subject signs a CredentialAccept.
export async function createCredential(
  params: CreateCredentialParams,
): Promise<CreateCredentialResult> {
  const issuerWallet = getIssuerWallet();
  const client       = await getXrplClient();

  const uri    = `hedera:${params.hederaNftTokenId}/${params.hederaNftSerial}`;
  const uriHex = Buffer.from(uri, 'utf8').toString('hex').toUpperCase();

  const tx: CredentialCreate = {
    TransactionType: 'CredentialCreate',
    Account:         issuerWallet.address,
    Subject:         params.subjectAddress,
    CredentialType:  CREDENTIAL_TYPE_HEX,
    URI:             uriHex,
    ...(params.expiresAt !== undefined && { Expiration: toRippleEpoch(params.expiresAt) }),
  };

  const result = await client.submitAndWait(tx, { wallet: issuerWallet });
  assertTxSuccess(result, 'CredentialCreate');

  return {
    txHash:       result.result.hash,
    credentialId: `${issuerWallet.address}:${params.subjectAddress}:${CREDENTIAL_TYPE_HEX}`,
  };
}

// Subject accepts a pending credential. Signed by the subject's wallet.
// In production the customer signs this from their own wallet client — this
// path exists primarily for testnet lifecycle testing and admin flows.
export async function acceptCredential(
  params: AcceptCredentialParams,
): Promise<{ txHash: string }> {
  if (!params.subjectSeed) {
    throw new Error('subjectSeed is required to sign CredentialAccept');
  }
  const subjectWallet    = Wallet.fromSeed(params.subjectSeed);
  const client           = await getXrplClient();
  const credentialTypeHex = Buffer.from(params.credentialType, 'utf8').toString('hex').toUpperCase();

  const tx: CredentialAccept = {
    TransactionType: 'CredentialAccept',
    Account:         subjectWallet.address,
    Issuer:          params.issuerAddress,
    CredentialType:  credentialTypeHex,
  };

  const result = await client.submitAndWait(tx, { wallet: subjectWallet });
  assertTxSuccess(result, 'CredentialAccept');

  return { txHash: result.result.hash };
}

// Issuer revokes a credential. Both accepted and unaccepted credentials are removed.
export async function deleteCredential(
  params: DeleteCredentialParams,
): Promise<{ txHash: string }> {
  const issuerWallet     = getIssuerWallet();
  const client           = await getXrplClient();
  const credentialTypeHex = Buffer.from(params.credentialType, 'utf8').toString('hex').toUpperCase();

  const tx: CredentialDelete = {
    TransactionType: 'CredentialDelete',
    Account:         issuerWallet.address,
    Subject:         params.subjectAddress,
    CredentialType:  credentialTypeHex,
  };

  const result = await client.submitAndWait(tx, { wallet: issuerWallet });
  assertTxSuccess(result, 'CredentialDelete');

  return { txHash: result.result.hash };
}

// Merchant configures DepositPreauth with AuthorizeCredentials. After this,
// any account holding an accepted Acquis-issued credential can pay the merchant
// even under DepositAuth flag.
export async function configureMerchantPreauth(
  params: ConfigureMerchantPreauthParams,
): Promise<{ txHash: string }> {
  const issuerAddress = process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS;
  if (!issuerAddress) throw new Error('XRPL_CREDENTIAL_ISSUER_ADDRESS must be set');
  if (!params.merchantSeed) throw new Error('merchantSeed is required to sign DepositPreauth');

  const merchantWallet = Wallet.fromSeed(params.merchantSeed);
  const client         = await getXrplClient();

  const tx: DepositPreauth = {
    TransactionType: 'DepositPreauth',
    Account:         merchantWallet.address,
    AuthorizeCredentials: [{
      Credential: {
        Issuer:         issuerAddress,
        CredentialType: CREDENTIAL_TYPE_HEX,
      },
    }],
  };

  const result = await client.submitAndWait(tx, { wallet: merchantWallet });
  assertTxSuccess(result, 'DepositPreauth');

  return { txHash: result.result.hash };
}

// Real implementation — uses raw ledger_entry RPC which works across xrpl versions.
export async function verifyCredential(
  params: { accountAddress: string },
): Promise<VerifyCredentialResult> {
  const issuerAddress = process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS;
  if (!issuerAddress) {
    return { valid: false, reason: 'issuer_not_configured' };
  }

  const client = await getXrplClient();

  try {
    // xrpl.js v4 has a mismatch: the TypeScript ledger_entry type declares
    // `credentialType` (camelCase) but rippled requires `credential_type`
    // (snake_case) on the wire and does NOT do the conversion itself.
    // Send snake_case at runtime; cast through unknown to satisfy the type.
    const response = await client.request({
      command: 'ledger_entry',
      credential: {
        subject:         params.accountAddress,
        issuer:          issuerAddress,
        credential_type: CREDENTIAL_TYPE_HEX,
      },
      ledger_index: 'validated',
    } as unknown as Parameters<typeof client.request>[0]);

    const entry = (response.result as { node?: Record<string, unknown> }).node;
    if (!entry) return { valid: false, reason: 'not_found' };

    // Expiration check — if the ledger entry carries an Expiration field
    // (Ripple Epoch integer) and it's in the past, the credential is
    // expired. Distinct reason from 'not_found' so operators can distinguish
    // "customer never enrolled" from "customer's credential lapsed."
    const expiration = entry['Expiration'] as number | undefined;
    if (typeof expiration === 'number' && expiration <= nowRippleEpoch()) {
      const uriHexExpired = entry['URI'] as string | undefined;
      const uriExpired = uriHexExpired ? Buffer.from(uriHexExpired, 'hex').toString('utf8') : '';
      return {
        valid: false,
        reason: 'expired',
        credential: {
          issuer:          issuerAddress,
          subject:         params.accountAddress,
          credential_type: 'AcquisMember',
          uri:             uriExpired,
          expiration,
        },
      };
    }

    const uriHex = entry['URI'] as string | undefined;
    const uri = uriHex ? Buffer.from(uriHex, 'hex').toString('utf8') : '';

    return {
      valid: true,
      credential: {
        issuer:          issuerAddress,
        subject:         params.accountAddress,
        credential_type: 'AcquisMember',
        uri,
        ...(typeof expiration === 'number' && { expiration }),
      },
    };
  } catch (err: unknown) {
    // Not-found comes back two ways: the wire error code on err.data.error
    // ("entryNotFound" / "objectNotFound") and a human-readable err.message
    // ("Entry not found."). Match both, case-insensitive, so we don't misclassify
    // a legitimate "no credential" state as an unhandled failure.
    const message   = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    const errorCode = (err as { data?: { error?: string } })?.data?.error;
    if (
      errorCode === 'entryNotFound' ||
      errorCode === 'objectNotFound' ||
      message.includes('entry not found') ||
      message.includes('object not found')
    ) {
      return { valid: false, reason: 'not_found' };
    }
    throw err;
  }
}
