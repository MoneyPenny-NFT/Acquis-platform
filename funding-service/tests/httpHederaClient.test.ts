import { HttpHederaClient } from '../src/clients/HttpHederaClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

describe('HttpHederaClient', () => {
  let client: HttpHederaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEDERA_SERVICE_URL        = 'http://hedera-svc';
    process.env.HEDERA_SERVICE_API_KEY    = 'test-api-key';
    process.env.ACQUIS_CONSENT_HCS_TOPIC_ID = '0.0.9342744';
    client = new HttpHederaClient();
  });

  afterEach(() => {
    delete process.env.HEDERA_SERVICE_URL;
    delete process.env.HEDERA_SERVICE_API_KEY;
    delete process.env.ACQUIS_CONSENT_HCS_TOPIC_ID;
  });

  it('validateInvoice POSTs to /funding/validate-invoice and returns result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, topicId: '0.0.9342744', messageId: '0.0.9186941@1000000000.000000000' }),
    });

    const result = await client.validateInvoice({
      fundingRequestId: 'rfp-001',
      hederaAccountId:  '0.0.9218284',
      amountCents:      5000,
    });

    expect(result.valid).toBe(true);
    expect(result.topicId).toBe('0.0.9342744');
    expect(result.messageId).toBe('0.0.9186941@1000000000.000000000');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://hedera-svc/api/v1/funding/validate-invoice');
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('test-api-key');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.fundingRequestId).toBe('rfp-001');
    expect(body.amountCents).toBe(5000);
  });

  it('writeHcs POSTs to /hcs/write with topic_id and serialised message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        topic_id:            '0.0.9342744',
        sequence_number:     3,
        consensus_timestamp: '2026-06-29T12:00:00.000Z',
        transaction_id:      '0.0.9186941@1751198400.000000000',
      }),
    });

    const result = await client.writeHcs({
      type:             'rfp.sent',
      fundingRequestId: 'rfp-002',
      providerRef:      'ref-abc',
    });

    expect(result.messageId).toBe('0.0.9186941@1751198400.000000000');
    expect(result.topicId).toBe('0.0.9342744');
    expect(result.consensusTimestamp).toBe('2026-06-29T12:00:00.000Z');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://hedera-svc/api/v1/hcs/write');
    const body = JSON.parse(opts.body as string) as { topic_id: string; message: string };
    expect(body.topic_id).toBe('0.0.9342744');
    const msg = JSON.parse(body.message) as Record<string, unknown>;
    expect(msg.type).toBe('rfp.sent');
    expect(msg.fundingRequestId).toBe('rfp-002');
  });

  it('creditBalance POSTs to /accounts/:id/credit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await client.creditBalance({
      hederaAccountId:  '0.0.9218284',
      amountCents:      7500,
      fundingRequestId: 'rfp-003',
    });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://hedera-svc/api/v1/accounts/0.0.9218284/credit');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.amountCents).toBe(7500);
    expect(body.fundingRequestId).toBe('rfp-003');
  });

  it('validateInvoice throws on non-OK response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      client.validateInvoice({ fundingRequestId: 'rfp-fail', hederaAccountId: '0.0.1', amountCents: 100 }),
    ).rejects.toThrow('validate-invoice returned HTTP 503');
  });
});
