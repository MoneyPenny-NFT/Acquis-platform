// Tests the shared HCS reader with chunk stitching. Mocks global fetch so
// each test controls exactly which mirror-node responses come back.
import { readHcsMessage, readHcsJson } from '../src/services/hcs.service';

const originalFetch = globalThis.fetch;
let responses: Record<string, any> = {};

function mockResponse(url: string, body: any, ok = true, status = 200) {
  responses[url] = { ok, status, json: async () => body };
}

beforeEach(() => {
  responses = {};
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    const r = responses[url];
    if (!r) throw new Error(`unmocked fetch: ${url}`);
    return r;
  });
});
afterAll(() => { globalThis.fetch = originalFetch; });

const BASE  = 'https://testnet.mirrornode.hedera.com';
const TOPIC = '0.0.9342744';

// Helper to build a mirror-node response with chunk_info
function chunk(seq: number, textPart: string, total: number, number: number, itxStart = '1234567890.000000000') {
  return {
    sequence_number:     seq,
    consensus_timestamp: '2026-07-13T00:00:00.000Z',
    message:             Buffer.from(textPart, 'utf8').toString('base64'),
    chunk_info: total > 1 ? {
      initial_transaction_id: {
        account_id: '0.0.9186941', nonce: 0, scheduled: false, transaction_valid_start: itxStart,
      },
      number, total,
    } : undefined,
  };
}

describe('readHcsMessage — single-chunk messages', () => {
  it('returns the decoded text for a single-chunk message', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/1`, chunk(1, 'hello world', 1, 1));
    const m = await readHcsMessage(TOPIC, 1);
    expect(m.chunkCount).toBe(1);
    expect(m.text).toBe('hello world');
    expect(m.topicId).toBe(TOPIC);
    expect(m.firstSequenceNumber).toBe(1);
  });

  it('throws when the mirror node returns a non-ok status', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/9999`, {}, false, 404);
    await expect(readHcsMessage(TOPIC, 9999)).rejects.toThrow(/Mirror Node 404/);
  });
});

describe('readHcsMessage — multi-chunk stitching', () => {
  it('stitches a 2-chunk message and returns the concatenated text', async () => {
    // Real payload: 1368-byte enforcement.evaluation split across seqs 31+32
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/31`, chunk(31, '{"first":"half",',   2, 1));
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/32`, chunk(32, '"second":"half"}', 2, 2));
    const m = await readHcsMessage(TOPIC, 31);
    expect(m.chunkCount).toBe(2);
    expect(m.text).toBe('{"first":"half","second":"half"}');
  });

  it('stitches a 3-chunk message', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/10`, chunk(10, 'AAA', 3, 1));
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/11`, chunk(11, 'BBB', 3, 2));
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/12`, chunk(12, 'CCC', 3, 3));
    const m = await readHcsMessage(TOPIC, 10);
    expect(m.text).toBe('AAABBBCCC');
    expect(m.chunkCount).toBe(3);
  });

  it('throws loud when a subsequent chunk carries a different initial_transaction_id', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/50`, chunk(50, 'part1',  2, 1, '1000.000000000'));
    // Intruder — belongs to a different logical message
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/51`, chunk(51, 'wrong!', 2, 2, '9999.000000000'));
    await expect(readHcsMessage(TOPIC, 50)).rejects.toThrow(/chunk stitching failed/);
  });

  it('throws loud when a subsequent chunk has the wrong chunk number', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/60`, chunk(60, 'part1', 2, 1));
    // Should be number 2, but comes back as number 3
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/61`, chunk(61, 'part?', 3, 3));
    await expect(readHcsMessage(TOPIC, 60)).rejects.toThrow(/chunk stitching failed/);
  });
});

describe('readHcsJson', () => {
  it('parses stitched JSON from a multi-chunk message end-to-end', async () => {
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/70`, chunk(70, '{"type":"enforcement.evaluation","approved":',  2, 1));
    mockResponse(`${BASE}/api/v1/topics/${TOPIC}/messages/71`, chunk(71, 'false,"failedRules":[{"a":1}]}', 2, 2));
    const parsed = await readHcsJson<{ type: string; approved: boolean; failedRules: unknown[] }>(TOPIC, 70);
    expect(parsed.type).toBe('enforcement.evaluation');
    expect(parsed.approved).toBe(false);
    expect(parsed.failedRules).toHaveLength(1);
  });
});
