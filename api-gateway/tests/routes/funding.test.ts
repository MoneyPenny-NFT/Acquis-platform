import { getApp, authHeader } from '../helpers';

jest.mock('@acquis/hedera-service', () => ({
  HCSService: {
    submitMessage: jest.fn().mockResolvedValue({
      topic_id:            '0.0.9342744',
      sequence_number:     5,
      consensus_timestamp: '2026-06-29T00:00:00.000Z',
      transaction_id:      '0.0.9186941@1000000000.000000000',
    }),
  },
}));

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

function getHcs() {
  return (jest.requireMock('@acquis/hedera-service') as { HCSService: { submitMessage: jest.Mock } }).HCSService;
}

describe('Funding routes — validate-invoice', () => {
  const app = getApp();
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/funding/validate-invoice returns 201 with valid=true and HCS messageId', async () => {
    process.env.ACQUIS_CONSENT_HCS_TOPIC_ID = '0.0.9342744';

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/funding/validate-invoice',
      payload: { fundingRequestId: 'rfp-001', hederaAccountId: '0.0.9218284', amountCents: 5000 },
      headers: authHeader,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.topicId).toBe('0.0.9342744');
    expect(body.messageId).toBe('0.0.9186941@1000000000.000000000');

    const submitMessage = getHcs().submitMessage;
    expect(submitMessage).toHaveBeenCalledWith(
      expect.objectContaining({ topic_id: '0.0.9342744' }),
    );
    const msg = JSON.parse(submitMessage.mock.calls[0][0].message as string) as Record<string, unknown>;
    expect(msg.type).toBe('invoice.validated');
    expect(msg.fundingRequestId).toBe('rfp-001');
    expect(msg.amountCents).toBe(5000);
  });

  it('POST /api/v1/funding/validate-invoice returns 400 when fields missing', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/funding/validate-invoice',
      payload: { fundingRequestId: 'rfp-001' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(400);
  });
});
