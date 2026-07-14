import { XrplWatcher, XrplLike } from '../../src/watchers/xrplWatcher';

// Deterministic in-memory prisma double — enough surface for the watcher.
function makePrisma(customerByAddr: Record<string, { acquisId: string }> = {}) {
  const detected: any[] = [];
  const watched: Record<string, any> = {};
  return {
    detected,
    watched,
    prisma: {
      detectedTransaction: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const key = `${data.chain}:${data.txHash}`;
          if (detected.some(d => `${d.chain}:${d.txHash}` === key)) {
            return Promise.reject(new Error('unique constraint'));
          }
          const row = { id: `dt-${detected.length}`, ...data };
          detected.push(row);
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = detected.find(d => d.id === where.id);
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
      },
      acquisCustomer: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(customerByAddr[where.xrplAddress] ?? null)),
      },
      watchedMerchantAccount: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const key = `${where.merchantId_chain_address.merchantId}:${where.merchantId_chain_address.chain}:${where.merchantId_chain_address.address}`;
          return Promise.resolve(watched[key] ?? null);
        }),
        upsert: jest.fn().mockImplementation(({ where, update, create }: any) => {
          const k = where.merchantId_chain_address;
          const key = `${k.merchantId}:${k.chain}:${k.address}`;
          watched[key] = watched[key] ? { ...watched[key], ...update } : { ...create };
          return Promise.resolve(watched[key]);
        }),
      },
    } as any,
  };
}

// Fake XRPL client that lets tests emit transactions on demand.
function makeFakeClient() {
  let handlers: Record<string, Array<(msg: any) => void>> = {};
  let connected = false;
  const requests: any[] = [];
  return {
    requests,
    handlers,
    emit: (event: string, msg: any) => (handlers[event] ?? []).forEach(h => h(msg)),
    setBackfill: (txs: any[]) => {
      // Mock account_tx response for the next request
      (client as any)._pendingBackfill = txs;
    },
    // The XrplLike interface impl
    connect:    async () => { connected = true; },
    disconnect: async () => { connected = false; },
    isConnected: () => connected,
    request:    async (req: any) => {
      requests.push(req);
      if (req.command === 'account_tx') {
        const pending = (client as any)._pendingBackfill ?? [];
        (client as any)._pendingBackfill = null;
        return { result: { transactions: pending } };
      }
      return { result: {} };
    },
    on: (event: string, handler: any) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    },
  } as XrplLike & { emit: (e: string, m: any) => void; setBackfill: (txs: any[]) => void; requests: any[] };
}
let client: any;

const MERCHANT_ADDR = 'rMerchant';
const CUSTOMER_ADDR = 'rCustomer';
const UNKNOWN_ADDR  = 'rStranger';

describe('XrplWatcher', () => {
  it('subscribes to merchant address on start', async () => {
    const { prisma } = makePrisma();
    client = makeFakeClient();
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client,
    });
    await w.start();
    expect(client.requests.some((r: any) => r.command === 'subscribe' && r.accounts.includes(MERCHANT_ADDR))).toBe(true);
    await w.stop();
  });

  it('credits reward when incoming payment is from a registered customer', async () => {
    const { prisma, detected } = makePrisma({ [CUSTOMER_ADDR]: { acquisId: 'acq_1' } });
    client = makeFakeClient();
    const onMatched = jest.fn().mockResolvedValue('rew_1');
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client,
      onMatchedPayment: onMatched,
    });
    await w.start();
    client.emit('transaction', {
      transaction: { TransactionType: 'Payment', Account: CUSTOMER_ADDR, Destination: MERCHANT_ADDR, Amount: '5000000', hash: 'TXABC' },
      meta:        { TransactionResult: 'tesSUCCESS', delivered_amount: '5000000' },
      ledger_index: 19040000,
      validated:    true,
    });
    // Let promise chain settle
    await new Promise(r => setImmediate(r));
    expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'm1', senderAddress: CUSTOMER_ADDR, txHash: 'TXABC', customerAcquisId: 'acq_1',
    }));
    expect(detected).toHaveLength(1);
    expect(detected[0].status).toBe('matched');
    await w.stop();
  });

  it('logs customer_not_found when sender is not a registered customer', async () => {
    const { prisma, detected } = makePrisma({});
    client = makeFakeClient();
    const onMatched = jest.fn();
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client,
      onMatchedPayment: onMatched,
    });
    await w.start();
    client.emit('transaction', {
      transaction: { TransactionType: 'Payment', Account: UNKNOWN_ADDR, Destination: MERCHANT_ADDR, Amount: '1000000', hash: 'TXXYZ' },
      meta:        { TransactionResult: 'tesSUCCESS' },
      ledger_index: 19040001,
      validated:    true,
    });
    await new Promise(r => setImmediate(r));
    expect(onMatched).not.toHaveBeenCalled();
    expect(detected).toHaveLength(1);
    expect(detected[0].status).toBe('customer_not_found');
    await w.stop();
  });

  it('is idempotent — duplicate emission for the same (chain, txHash) is a no-op', async () => {
    const { prisma, detected } = makePrisma({ [CUSTOMER_ADDR]: { acquisId: 'acq_1' } });
    client = makeFakeClient();
    const onMatched = jest.fn().mockResolvedValue('rew_1');
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client, onMatchedPayment: onMatched,
    });
    await w.start();
    const tx = {
      transaction: { TransactionType: 'Payment', Account: CUSTOMER_ADDR, Destination: MERCHANT_ADDR, Amount: '5000000', hash: 'DUPE' },
      meta:        { TransactionResult: 'tesSUCCESS' },
      ledger_index: 19040002, validated: true,
    };
    client.emit('transaction', tx);
    await new Promise(r => setImmediate(r));
    client.emit('transaction', tx);
    await new Promise(r => setImmediate(r));
    expect(onMatched).toHaveBeenCalledTimes(1);
    expect(detected).toHaveLength(1);
    await w.stop();
  });

  it('ignores non-Payment transactions and failed payments', async () => {
    const { prisma, detected } = makePrisma({ [CUSTOMER_ADDR]: { acquisId: 'acq_1' } });
    client = makeFakeClient();
    const onMatched = jest.fn();
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client, onMatchedPayment: onMatched,
    });
    await w.start();
    client.emit('transaction', {
      transaction: { TransactionType: 'TrustSet', Account: CUSTOMER_ADDR, Destination: MERCHANT_ADDR, hash: 'TS1' },
      meta:        { TransactionResult: 'tesSUCCESS' },
      validated:   true, ledger_index: 19040003,
    });
    client.emit('transaction', {
      transaction: { TransactionType: 'Payment', Account: CUSTOMER_ADDR, Destination: MERCHANT_ADDR, Amount: '1', hash: 'FAILED' },
      meta:        { TransactionResult: 'tecFAILED' },
      validated:   true, ledger_index: 19040004,
    });
    await new Promise(r => setImmediate(r));
    expect(onMatched).not.toHaveBeenCalled();
    expect(detected).toHaveLength(0);
    await w.stop();
  });

  it('ignores outgoing payments (Destination != watched address)', async () => {
    const { prisma, detected } = makePrisma({ [CUSTOMER_ADDR]: { acquisId: 'acq_1' } });
    client = makeFakeClient();
    const onMatched = jest.fn();
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client, onMatchedPayment: onMatched,
    });
    await w.start();
    client.emit('transaction', {
      transaction: { TransactionType: 'Payment', Account: MERCHANT_ADDR, Destination: CUSTOMER_ADDR, Amount: '1000', hash: 'OUT' },
      meta:        { TransactionResult: 'tesSUCCESS' },
      validated: true, ledger_index: 19040005,
    });
    await new Promise(r => setImmediate(r));
    expect(onMatched).not.toHaveBeenCalled();
    expect(detected).toHaveLength(0);
    await w.stop();
  });

  it('runs backfill via account_tx before subscribing', async () => {
    const { prisma, detected } = makePrisma({ [CUSTOMER_ADDR]: { acquisId: 'acq_1' } });
    client = makeFakeClient();
    client.setBackfill([
      { tx: { TransactionType: 'Payment', Account: CUSTOMER_ADDR, Destination: MERCHANT_ADDR, Amount: '2000000', hash: 'BACKFILL1' },
        meta: { TransactionResult: 'tesSUCCESS' }, validated: true, ledger_index: 19039000 },
    ]);
    const onMatched = jest.fn().mockResolvedValue('rew_bf');
    const w = new XrplWatcher({
      prisma, log: mockLog(), merchantId: 'm1', address: MERCHANT_ADDR,
      clientFactory: () => client, onMatchedPayment: onMatched,
    });
    await w.start();
    await new Promise(r => setImmediate(r));
    expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({ txHash: 'BACKFILL1' }));
    expect(detected[0].status).toBe('matched');
    // Confirm subscribe came after backfill
    const idxBackfill  = client.requests.findIndex((r: any) => r.command === 'account_tx');
    const idxSubscribe = client.requests.findIndex((r: any) => r.command === 'subscribe');
    expect(idxBackfill).toBeLessThan(idxSubscribe);
    await w.stop();
  });
});

function mockLog() {
  return {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn(),
    child: () => mockLog(), level: 'info', silent: false,
  } as any;
}
