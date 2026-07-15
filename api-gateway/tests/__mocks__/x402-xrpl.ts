// Manual mock for x402-xrpl. Tests never hit the real SDK or the network;
// they exercise the pay.ts orchestration around verify/settle by controlling
// what each mocked call resolves with (or throws).

export const verifyMock = jest.fn();
export const settleMock = jest.fn();
export const preparePaymentMock = jest.fn();
export const encodePaymentRequiredHeaderMock = jest.fn(
  (_body: unknown) => 'BASE64_MOCK_PAYMENT_REQUIRED_HEADER',
);

export class XRPLPresignedPaymentPayer {
  constructor(_opts: unknown, _params?: unknown) {}
  preparePayment = preparePaymentMock;
}

export class FacilitatorClient {
  constructor(_opts: unknown) {}
  verify = verifyMock;
  settle = settleMock;
}

export const encodePaymentRequiredHeader = encodePaymentRequiredHeaderMock;

// Reset helper: call from test beforeEach to get clean mock state.
export function resetX402Mocks(defaults?: {
  prepare?: unknown;
  verify?: unknown;
  settle?: unknown;
}): void {
  preparePaymentMock.mockReset().mockResolvedValue(
    defaults?.prepare ?? {
      paymentPayload:  { x402Version: 2, accepted: {}, payload: {} },
      paymentHeader:   'BASE64_MOCK_PAYMENT_SIGNATURE',
      signedTxBlob:    'DEADBEEFCAFEBABE',
      invoiceId:       'acquis-mock-invoice',
    },
  );
  verifyMock.mockReset().mockResolvedValue(
    defaults?.verify ?? { isValid: true, payer: 'rMockCustomer' },
  );
  settleMock.mockReset().mockResolvedValue(
    defaults?.settle ?? {
      success:     true,
      transaction: 'MOCKX402TXHASH1234567890',
      network:     'xrpl:1',
      payer:       'rMockCustomer',
    },
  );
  encodePaymentRequiredHeaderMock.mockClear();
}
