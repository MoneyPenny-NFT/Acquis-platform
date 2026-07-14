// Xumm/Xaman SDK wrapper. Currently uses fetch against the Xumm public API
// rather than the xumm-sdk npm package, to keep the dependency graph small.
// Real HTTP calls when XUMM_API_KEY + XUMM_API_SECRET are set; deterministic
// stubs otherwise (useful for local dev and integration tests without a live
// Xaman developer account).
//
// Docs: https://xumm.readme.io/reference/about
// Endpoint: POST https://xumm.app/api/v1/platform/payload  (create SignIn)
//           GET  https://xumm.app/api/v1/platform/payload/{uuid} (poll status)

const XUMM_BASE = 'https://xumm.app/api/v1/platform';

export interface XummCredentials {
  apiKey:    string;
  apiSecret: string;
}

export interface XummSignInResponse {
  uuid:            string;
  next:            { always: string };
  refs:            { qr_png: string; qr_matrix: string; websocket_status: string };
  pushed:          boolean;
}

export interface XummPayloadStatus {
  meta:        { exists: boolean; uuid: string; resolved: boolean; signed: boolean; cancelled: boolean; expired: boolean };
  response:    { account: string | null; txid: string | null; resolved_at: string | null };
  application: { name: string };
}

function getCreds(): XummCredentials | null {
  const key    = process.env.XUMM_API_KEY;
  const secret = process.env.XUMM_API_SECRET;
  if (!key || !secret) return null;
  return { apiKey: key, apiSecret: secret };
}

// Creates a Xumm SignIn payload. Returns the pairing UUID + a URL/QR the
// customer scans with Xaman. When credentials are absent, returns a stub
// payload with a synthetic UUID so downstream code paths can be exercised
// end-to-end in dev without a real Xaman account.
export async function createSignInPayload(
  metadata: { sessionId: string; merchantId: string },
): Promise<XummSignInResponse> {
  const creds = getCreds();
  if (!creds) {
    // Deterministic stub — the enrollment endpoint returns this, and the
    // "wallet callback" is simulated by directly calling /complete with an
    // XRPL address. Real Xaman-scan flow requires XUMM_API_KEY + SECRET.
    return {
      uuid:   `stub-xumm-${metadata.sessionId}`,
      next:   { always: `https://xumm.app/sign/stub-xumm-${metadata.sessionId}` },
      refs:   {
        qr_png:           `https://xumm.app/sign/stub-xumm-${metadata.sessionId}_q.png`,
        qr_matrix:        `https://xumm.app/sign/stub-xumm-${metadata.sessionId}_q.json`,
        websocket_status: `wss://xumm.app/sign/stub-xumm-${metadata.sessionId}`,
      },
      pushed: false,
    };
  }

  const res = await fetch(`${XUMM_BASE}/payload`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'X-API-Key':       creds.apiKey,
      'X-API-Secret':    creds.apiSecret,
    },
    body: JSON.stringify({
      txjson: { TransactionType: 'SignIn' },
      custom_meta: {
        identifier: metadata.sessionId,
        blob:       { merchantId: metadata.merchantId, sessionId: metadata.sessionId },
      },
    }),
  });
  if (!res.ok) throw new Error(`Xumm createSignInPayload failed: ${res.status}`);
  return (await res.json()) as XummSignInResponse;
}

// Polls a payload for resolution. Returns whether the customer signed,
// and the XRPL account they signed with. When credentials are absent
// (stub mode) returns { meta: { exists:false, ... } } so callers can
// bypass polling and expect a direct /complete callback.
export async function getPayloadStatus(uuid: string): Promise<XummPayloadStatus> {
  const creds = getCreds();
  if (!creds) {
    return {
      meta:        { exists: false, uuid, resolved: false, signed: false, cancelled: false, expired: false },
      response:    { account: null, txid: null, resolved_at: null },
      application: { name: 'stub' },
    };
  }
  const res = await fetch(`${XUMM_BASE}/payload/${uuid}`, {
    headers: { 'X-API-Key': creds.apiKey, 'X-API-Secret': creds.apiSecret },
  });
  if (!res.ok) throw new Error(`Xumm getPayloadStatus failed: ${res.status}`);
  return (await res.json()) as XummPayloadStatus;
}

export function isXummConfigured(): boolean {
  return getCreds() !== null;
}
