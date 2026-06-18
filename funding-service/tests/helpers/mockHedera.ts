import type { HederaClient } from '../../src/clients/HederaClient';

export function createMockHederaClient(): jest.Mocked<HederaClient> {
  let seq = 0;
  return {
    validateInvoice: jest.fn().mockImplementation(() =>
      Promise.resolve({
        valid:     true,
        topicId:   'mock-topic-0.0.1234',
        messageId: `mock-invoice-${++seq}`,
      }),
    ),
    writeHcs: jest.fn().mockImplementation(() =>
      Promise.resolve({
        messageId:          `mock-hcs-${++seq}`,
        topicId:            'mock-topic-0.0.1234',
        consensusTimestamp: new Date().toISOString(),
      }),
    ),
    creditBalance: jest.fn().mockResolvedValue(undefined),
  };
}
