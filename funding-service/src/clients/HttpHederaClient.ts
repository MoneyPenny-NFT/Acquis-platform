import type {
  HederaClient,
  InvoiceValidationRequest,
  InvoiceValidationResult,
  HcsWriteRequest,
  HcsWriteResult,
  CreditBalanceRequest,
} from './HederaClient';

export class HttpHederaClient implements HederaClient {
  private get baseUrl(): string {
    return process.env.HEDERA_SERVICE_URL ?? 'http://localhost:3000';
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': process.env.HEDERA_SERVICE_API_KEY ?? '',
    };
  }

  async validateInvoice(req: InvoiceValidationRequest): Promise<InvoiceValidationResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/funding/validate-invoice`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`validate-invoice returned HTTP ${res.status}`);
    return res.json() as Promise<InvoiceValidationResult>;
  }

  async writeHcs(req: HcsWriteRequest): Promise<HcsWriteResult> {
    const topicId = process.env.ACQUIS_CONSENT_HCS_TOPIC_ID ?? '0.0.9342744';
    const res = await fetch(`${this.baseUrl}/api/v1/hcs/write`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({ topic_id: topicId, message: JSON.stringify(req) }),
    });
    if (!res.ok) throw new Error(`hcs/write returned HTTP ${res.status}`);
    const data = await res.json() as {
      topic_id:            string;
      sequence_number:     number;
      consensus_timestamp: string;
      transaction_id:      string;
    };
    return {
      messageId:          data.transaction_id,
      topicId:            data.topic_id,
      consensusTimestamp: data.consensus_timestamp,
    };
  }

  async creditBalance(req: CreditBalanceRequest): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/accounts/${req.hederaAccountId}/credit`,
      {
        method:  'POST',
        headers: this.headers,
        body:    JSON.stringify({ amountCents: req.amountCents, fundingRequestId: req.fundingRequestId }),
      },
    );
    if (!res.ok) throw new Error(`accounts/credit returned HTTP ${res.status}`);
  }
}
