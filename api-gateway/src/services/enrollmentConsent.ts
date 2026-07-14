// Static consent text presented to customers during QR-scan enrollment.
// Explicitly names the wallet-address-to-identity linkage — this is the
// legally significant disclosure that goes beyond the existing marketing/
// rewards consent (which covers use of contact data, not chain-address linkage).
//
// The text hash is written to HCS on enrollment completion; ANY change to
// this constant creates a new version and a new hash. Attorney sign-off
// required on the substance before QR_ENROLLMENT_ENABLED can be flipped
// to true in production — same gate pattern as MERCHANT_AGREEMENT_ENABLED
// and KYC_ENFORCEMENT_ENABLED.

import { createHash } from 'crypto';

export const CONSENT_VERSION = 'qr-v1-2026-07-13-draft';

export const CONSENT_TEXT = [
  'Acquis Rewards — Wallet Enrollment Disclosure',
  '',
  'By scanning this QR code and approving the sign-in request in your XRPL wallet, you understand and agree to the following:',
  '',
  '1. Wallet-to-identity linkage. Acquis will store your public XRPL wallet address as part of your customer record. Your wallet address will be permanently associated in Acquis\'s systems with any contact information you have already provided (phone, email) and with any future transactions between your wallet and participating Acquis merchants.',
  '',
  '2. Public wallet-address disclosure is not the same as public activity disclosure. Your wallet address is already public on-chain; the new information Acquis will hold is the LINK between that address and your identity in Acquis\'s system. That link is not published on-chain except in the form of an on-ledger credential that Acquis issues to your address.',
  '',
  '3. AcquisMember credential. Acquis will issue an XRPL Credential (XLS-70) to your wallet address as a badge of enrollment. You may accept or reject the credential; either way, the enrollment record remains in Acquis\'s systems and on the Hedera Consensus Service audit log until you request removal.',
  '',
  '4. Passive transaction detection. Once enrolled, Acquis will monitor participating merchants\' public XRPL accounts for incoming payments from your wallet address and credit rewards automatically. Only transactions between your enrolled address and enrolled merchants are considered; unrelated wallet activity is not read or stored.',
  '',
  '5. Revocation. You may revoke consent at any time through your customer preferences. Revocation stops future reward credits and marks the credential for deletion. It does not remove past HCS records, which are immutable by design.',
  '',
  '6. Draft — pending attorney review. This text is a DRAFT. It must not be presented to real customers as a final agreement until attorney review is complete. This constant, and this line, will be replaced or removed at that time.',
].join('\n');

// Cached at module load. The hash is what goes into HCS + DB; the text itself
// stays in code so an auditor can reconstruct exactly what was agreed to.
export const CONSENT_TEXT_HASH = createHash('sha256').update(CONSENT_TEXT, 'utf8').digest('hex');
