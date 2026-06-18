export const generateDestinationTag = () => Math.floor(Math.random() * (2 ** 32 - 1)) + 1;
export const usdCentsToXrp = (cents: number, rate: number) => cents / 100 / rate;
export const xrpToDrops = (xrp: number) => String(Math.floor(xrp * 1_000_000));
export const dropsToXrp = (drops: string) => Number(drops) / 1_000_000;
export const formatXrp = (xrp: number) => xrp.toFixed(6);

export const executeTestnetPayment = jest.fn().mockResolvedValue({
  txHash: 'MOCKTXHASH1234567890ABCDEF',
  destinationTag: 42,
  amountXrp: 1.0,
  amountDrops: '1000000',
});

export const getAccountInfo = jest.fn().mockResolvedValue({
  address: 'rMockXRPAddress',
  xrpBalance: '100.000000',
  sequence: 1,
});

export const getXrplClient = jest.fn();
export const disconnectXrplClient = jest.fn().mockResolvedValue(undefined);
export const sendPayment = jest.fn().mockResolvedValue({ txHash: 'MOCKTXHASH', destinationTag: 42 });

export class SmartNodeGateway {
  constructor(_config: unknown) {}
  initialize = jest.fn().mockResolvedValue(undefined);
  validatePayment = jest.fn().mockResolvedValue({ isValid: true, reason: undefined, ruleRef: null });
  isReady = jest.fn().mockReturnValue(false);
  getRuleRef = jest.fn().mockReturnValue(null);
}
