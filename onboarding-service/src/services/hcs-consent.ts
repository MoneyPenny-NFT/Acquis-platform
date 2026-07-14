export interface ConsentRecord {
  session_id: string;
  consent_text: string;
  consented_at: string;
  email: string | null;
}

export interface HCSConsentResult {
  hcs_topic_id: string;
  hcs_sequence_num: number;
  hcs_timestamp: string;
  hcs_transaction_id: string;
}

export const CONSENT_TEXT =
  'By continuing, you authorize Acquis to:\n' +
  '- Verify your identity using the information provided\n' +
  '- Access your linked bank account for payment processing under your standing approval authorization\n' +
  '- Store a permanent record of your consent on the Hedera public ledger (immutable, timestamped, publicly verifiable)\n' +
  '- Issue you a digital membership credential on Hedera and the XRP Ledger to authorize payments at Acquis merchants\n\n' +
  'This enrollment constitutes your Customer Identification record under the Bank Secrecy Act. ' +
  'Acquis is registered with FinCEN as a Money Services Business (prepaid access provider).';

export async function writeConsentToHCS(record: ConsentRecord): Promise<HCSConsentResult> {
  const topicId = process.env.ACQUIS_CONSENT_HCS_TOPIC_ID ?? '0.0.9342744';
  const hederaServiceUrl = process.env.HEDERA_SERVICE_URL ?? 'http://localhost:3000';

  const res = await fetch(`${hederaServiceUrl}/api/v1/hcs/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic_id: topicId, message: JSON.stringify(record) }),
  });

  if (!res.ok) {
    throw new Error(`HCS consent write failed — hedera-service returned HTTP ${res.status}`);
  }

  const data = await res.json() as {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    transaction_id: string;
  };

  return {
    hcs_topic_id:       data.topic_id,
    hcs_sequence_num:   data.sequence_number,
    hcs_timestamp:      data.consensus_timestamp,
    hcs_transaction_id: data.transaction_id,
  };
}
