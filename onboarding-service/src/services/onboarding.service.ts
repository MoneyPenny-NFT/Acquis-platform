import { randomUUID } from 'crypto';
import { prisma } from '../db';
import {
  createIDVSession,
  getIDVResult,
  isIDVSuccess,
  createLinkToken,
  exchangePublicToken,
  IDVCreateResult,
  BankLinkResult,
} from './plaid.service';
import { writeConsentToHCS, CONSENT_TEXT } from './hcs-consent';

function sessionExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}

function assertNotExpired(expiresAt: Date): void {
  if (new Date() > expiresAt) {
    throw Object.assign(new Error('Session expired'), { code: 'SESSION_EXPIRED' });
  }
}

export async function createSession(email: string, phone?: string): Promise<{ session_id: string }> {
  const session_id = randomUUID();
  await prisma.onboardingSession.create({
    data: {
      session_id,
      email,
      phone: phone ?? null,
      expires_at: sessionExpiry(),
    },
  });
  return { session_id };
}

export async function startIDV(sessionId: string): Promise<IDVCreateResult> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  if (!session.email) throw new Error('Email is required to start IDV');

  const result = await createIDVSession(session.email);

  await prisma.onboardingSession.update({
    where: { session_id: sessionId },
    data: { idv_status: 'in_progress' },
  });

  return result;
}

export async function completeIDV(sessionId: string, idvId: string): Promise<{ status: string }> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  const result = await getIDVResult(idvId);
  const completed = isIDVSuccess(result.status);

  await prisma.onboardingSession.update({
    where: { session_id: sessionId },
    data: {
      idv_status: completed ? 'completed' : result.status,
      idv_completed_at: completed ? new Date() : null,
      legal_name: result.legal_name,
      date_of_birth: result.date_of_birth,
      address_city: result.address_city,
      address_region: result.address_region,
      address_postal: result.address_postal,
      documentary_status: result.documentary_status,
      selfie_status: result.selfie_status,
    },
  });

  return { status: completed ? 'completed' : result.status };
}

export async function startBankLink(sessionId: string): Promise<{ link_token: string }> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  if (session.idv_status !== 'completed') {
    throw Object.assign(new Error('IDV must be completed before bank link'), { code: 'STEP_ORDER' });
  }

  const result = await createLinkToken(session.session_id);
  return { link_token: result.link_token };
}

export async function completeBankLink(
  sessionId: string,
  publicToken: string,
): Promise<BankLinkResult> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  if (session.idv_status !== 'completed') {
    throw Object.assign(new Error('IDV must be completed before bank link'), { code: 'STEP_ORDER' });
  }

  const legalName = session.legal_name ?? '';
  const result = await exchangePublicToken(publicToken, legalName);

  await prisma.onboardingSession.update({
    where: { session_id: sessionId },
    data: {
      bank_link_status: 'completed',
      bank_link_completed_at: new Date(),
      plaid_item_id: result.item_id,
      account_mask: result.account_mask,
      account_type: result.account_type,
      institution_name: result.institution_name,
      identity_match_status: result.identity_match_status,
      identity_match_score: result.identity_match_score,
    },
  });

  return result;
}

export interface ConsentResult {
  hcs_topic_id: string;
  hcs_sequence_num: number;
  hcs_timestamp: string;
}

export async function recordConsent(sessionId: string): Promise<ConsentResult> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  if (session.idv_status !== 'completed') {
    throw Object.assign(new Error('IDV must be completed before consent'), { code: 'STEP_ORDER' });
  }
  if (session.bank_link_status !== 'completed') {
    throw Object.assign(new Error('Bank link must be completed before consent'), { code: 'STEP_ORDER' });
  }

  const hcsResult = await writeConsentToHCS({
    session_id: session.session_id,
    consent_text: CONSENT_TEXT,
    consented_at: new Date().toISOString(),
    email: session.email,
  });

  const acquisId = session.acquis_id ?? ('ACQ-' + session.id);

  await prisma.onboardingSession.update({
    where: { session_id: sessionId },
    data: {
      consent_status: 'completed',
      consent_completed_at: new Date(),
      hcs_topic_id: hcsResult.hcs_topic_id,
      hcs_sequence_num: hcsResult.hcs_sequence_num,
      hcs_timestamp: hcsResult.hcs_timestamp,
      hcs_transaction_id: hcsResult.hcs_transaction_id,
      acquis_id: acquisId,
    },
  });

  // Non-blocking: consent is committed to HCS and cannot be undone.
  // Credential failure is retried separately — never fails the response.
  void enrollCredential(sessionId, acquisId, session.xrpl_address);

  return {
    hcs_topic_id: hcsResult.hcs_topic_id,
    hcs_sequence_num: hcsResult.hcs_sequence_num,
    hcs_timestamp: hcsResult.hcs_timestamp,
  };
}

async function enrollCredential(
  sessionId: string,
  acquisId: string,
  xrplAddress: string | null,
): Promise<void> {
  // TODO (production): use customer's own Hedera account, provisioned during onboarding
  const hederaAccountId = process.env.HEDERA_OPERATOR_ID ?? '';

  // TODO (production): use customer's XRPL wallet address
  const xrplAddr = xrplAddress ?? `xrpl-pending-${acquisId}`;

  const credentialServiceUrl = process.env.CREDENTIAL_SERVICE_URL ?? 'http://localhost:3004';

  try {
    const res = await fetch(`${credentialServiceUrl}/api/v1/credentials/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        acquis_id: acquisId,
        hedera_account_id: hederaAccountId,
        xrpl_address: xrplAddr,
        tier: 'starter',
      }),
    });

    if (!res.ok) {
      throw new Error(`Credential enrollment returned HTTP ${res.status}`);
    }

    const result = await res.json() as {
      hedera_nft_token_id: string;
      hedera_nft_serial: number;
      xrpl_credential_tx_hash: string;
    };

    await prisma.onboardingSession.update({
      where: { session_id: sessionId },
      data: {
        credential_status: 'active',
        hedera_nft_token_id: result.hedera_nft_token_id,
        hedera_nft_serial: result.hedera_nft_serial,
        xrpl_credential_tx: result.xrpl_credential_tx_hash,
      },
    });
  } catch (err) {
    console.error('[enrollCredential] failed — will be retried separately', { acquisId, err });
    try {
      await prisma.onboardingSession.update({
        where: { session_id: sessionId },
        data: { credential_status: 'failed' },
      });
    } catch {
      // session may have been cleaned up; ignore
    }
  }
}

export async function getSessionStatus(sessionId: string): Promise<{
  session_id: string;
  idv_status: string;
  bank_link_status: string;
  consent_status: string;
  credential_status: string;
  acquis_id: string | null;
  expires_at: string;
}> {
  const session = await prisma.onboardingSession.findUniqueOrThrow({ where: { session_id: sessionId } });
  assertNotExpired(session.expires_at);

  return {
    session_id: session.session_id,
    idv_status: session.idv_status,
    bank_link_status: session.bank_link_status,
    consent_status: session.consent_status,
    credential_status: session.credential_status,
    acquis_id: session.acquis_id,
    expires_at: session.expires_at.toISOString(),
  };
}
