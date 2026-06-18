export type PaymentMode = 'token' | 'hbar';

export interface AcquisConfig {
  /** Base URL of the api-gateway, e.g. "https://api.acquis.io" */
  apiBaseUrl: string;
  /** Hedera account ID that funds outgoing payments */
  treasuryAccountId: string;
  /** Private key for the treasury account */
  treasuryKey: string;
  /** Default token ID used for token-mode payments */
  tokenId?: string;
}

export interface AccountInfo {
  accountId: string;
  [key: string]: unknown;
}

export interface TokenInfo {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
}

export interface TransferResult {
  fromId: string;
  toId: string;
  amount: number;
  tokenId?: string;
  asset?: string;
}

export interface PaymentRequest {
  /** Destination Hedera account ID */
  toAccountId: string;
  /** Amount to send */
  amount: number;
  /** Payment mode; defaults to "token" */
  mode?: PaymentMode;
  /** Override the SDK-level tokenId for this payment */
  tokenId?: string;
}

export interface PaymentResult {
  success: boolean;
  transfer?: TransferResult;
  error?: string;
}

export interface WidgetOptions {
  /** DOM element to mount the widget into */
  container: HTMLElement | string;
  /** Called with the result after each payment attempt */
  onPayment?: (result: PaymentResult) => void;
  /** Default amount pre-filled in the widget */
  defaultAmount?: number;
  /** Label shown on the pay button */
  buttonLabel?: string;
}
