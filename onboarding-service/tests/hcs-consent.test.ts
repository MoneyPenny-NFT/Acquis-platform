import { writeConsentToHCS } from '../src/services/hcs-consent';

const fetchMock = jest.fn();
global.fetch = fetchMock;

describe('writeConsentToHCS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEDERA_SERVICE_URL = 'http://hedera-svc';
    process.env.ACQUIS_CONSENT_HCS_TOPIC_ID = '0.0.9342744';
  });

  afterEach(() => {
    delete process.env.HEDERA_SERVICE_URL;
    delete process.env.ACQUIS_CONSENT_HCS_TOPIC_ID;
  });

  it('calls hedera-service and maps the HCS result correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        topic_id:            '0.0.9342744',
        sequence_number:     7,
        consensus_timestamp: '2026-06-29T12:00:00.000Z',
        transaction_id:      '0.0.9186941@1751198400.000000000',
      }),
    });

    const result = await writeConsentToHCS({
      session_id:   'sess-001',
      consent_text: 'test consent',
      consented_at: '2026-06-29T12:00:00.000Z',
      email:        'test@example.com',
    });

    expect(result.hcs_topic_id).toBe('0.0.9342744');
    expect(result.hcs_sequence_num).toBe(7);
    expect(result.hcs_timestamp).toBe('2026-06-29T12:00:00.000Z');
    expect(result.hcs_transaction_id).toBe('0.0.9186941@1751198400.000000000');

    const [url, opts] = (fetchMock as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://hedera-svc/api/v1/hcs/write');
    const body = JSON.parse(opts.body as string) as { topic_id: string; message: string };
    expect(body.topic_id).toBe('0.0.9342744');
    expect(body.message).toContain('sess-001');
  });

  it('throws if hedera-service returns an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      writeConsentToHCS({ session_id: 'sess-002', consent_text: 'x', consented_at: '2026-06-29T00:00:00Z', email: null }),
    ).rejects.toThrow('HCS consent write failed — hedera-service returned HTTP 503');
  });
});
