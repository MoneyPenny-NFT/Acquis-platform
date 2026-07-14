import {
  createMetadataTopic,
  submitMetadata,
  getMetadataFromHCS,
  submitMessage,
} from '../src/services/hcs.service';
import type { AcquisCustomerNFT } from '../src/services/nft.service';

jest.mock('../src/client', () => ({ getClient: jest.fn() }));

// Module-level mock vars (must start with "mock" for Jest hoisting)
const mockRecord = {
  consensusTimestamp: {
    seconds: { toNumber: () => 1751145600 },
    nanos:   { toNumber: () => 0 },
  },
  receipt: {
    topicSequenceNumber: { toNumber: () => 42 },
  },
};
const mockGetRecord = jest.fn().mockResolvedValue(mockRecord);
const mockResponse  = { getRecord: mockGetRecord, transactionId: { toString: () => '0.0.9186941@1751145600.000000000' } };
const mockExecute   = jest.fn().mockResolvedValue(mockResponse);
const mockSignedTx  = { execute: mockExecute };
const mockSign      = jest.fn().mockResolvedValue(mockSignedTx);

jest.mock('@hashgraph/sdk', () => ({
  TopicCreateTransaction: jest.fn(),
  TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => ({
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
    sign:       mockSign,
  })),
  PrivateKey: {
    fromString:      jest.fn().mockReturnValue({ publicKey: {} }),
    fromStringECDSA: jest.fn().mockReturnValue({ publicKey: {} }),
  },
}));

const SAMPLE_METADATA: AcquisCustomerNFT = {
  version: '1.0',
  acquis_id: 'acq-test-001',
  xrpl_address: 'rU2gCTb79SLxAaGPQkc5RYcAwzfhr4yLLq',
  tier: 'starter',
  aqs_balance: 0,
  network_memberships: [],
  agent_authorized: false,
  enrolled_at: '2026-06-26T00:00:00Z',
  last_updated: '2026-06-26T00:00:00Z',
  status: 'active',
};

describe('HCSService', () => {
  it('createMetadataTopic returns existing topic_id when ACQUIS_METADATA_TOPIC_ID is set', async () => {
    process.env.ACQUIS_METADATA_TOPIC_ID = '0.0.5555555';
    const result = await createMetadataTopic();
    expect(result.topic_id).toBe('0.0.5555555');
    delete process.env.ACQUIS_METADATA_TOPIC_ID;
  });

  it('submitMetadata throws when ACQUIS_METADATA_TOPIC_ID is not set', async () => {
    delete process.env.ACQUIS_METADATA_TOPIC_ID;
    delete process.env.HEDERA_OPERATOR_KEY;
    await expect(submitMetadata(SAMPLE_METADATA)).rejects.toThrow(
      'ACQUIS_METADATA_TOPIC_ID must be set',
    );
  });

  it('getMetadataFromHCS decodes base64 Mirror Node response correctly', async () => {
    const encoded = Buffer.from(JSON.stringify(SAMPLE_METADATA)).toString('base64');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: encoded }),
    }) as unknown as typeof fetch;

    const result = await getMetadataFromHCS('0.0.5555555', 1);
    expect(result.acquis_id).toBe('acq-test-001');
    expect(result.tier).toBe('starter');
    expect(result.status).toBe('active');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('testnet.mirrornode.hedera.com');
    expect(url).toContain('0.0.5555555');
    expect(url).toContain('/messages/1');
  });

  it('getMetadataFromHCS throws on non-OK Mirror Node response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await expect(getMetadataFromHCS('0.0.5555555', 99)).rejects.toThrow('Mirror Node 404');
  });

  it('submitMessage returns sequence_number, consensus_timestamp, and transaction_id', async () => {
    const result = await submitMessage({ topic_id: '0.0.9342744', message: '{"test":true}' });
    expect(result.topic_id).toBe('0.0.9342744');
    expect(result.sequence_number).toBe(42);
    expect(result.consensus_timestamp).toBe(new Date(1751145600 * 1000).toISOString());
    expect(result.transaction_id).toBe('0.0.9186941@1751145600.000000000');
  });

  it('submitMessage throws when Hedera SDK call fails', async () => {
    mockSign.mockRejectedValueOnce(new Error('Hedera network timeout'));
    await expect(
      submitMessage({ topic_id: '0.0.9342744', message: 'test' }),
    ).rejects.toThrow('Hedera network timeout');
  });
});
