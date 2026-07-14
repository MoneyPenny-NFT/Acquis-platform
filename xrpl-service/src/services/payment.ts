import type { Payment } from 'xrpl';
import { Wallet } from 'xrpl';
import { getXrplClient } from '../client';
import { usdCentsToXrp, xrpToDrops } from '../utils/currency';

export interface SendPaymentParams {
  fromSeed: string;
  toAddress: string;
  amountDrops: string;
  destinationTag?: number;
  memo?: string;
}

export interface PaymentResult {
  txHash: string;
  ledgerIndex: number;
  amountDrops: string;
  destinationTag?: number;
  fee?: string;
}

export async function sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
  const client = await getXrplClient();
  const wallet = Wallet.fromSeed(params.fromSeed);

  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: params.toAddress,
    Amount: params.amountDrops,
    ...(params.destinationTag !== undefined && { DestinationTag: params.destinationTag }),
    ...(params.memo && {
      Memos: [{
        Memo: {
          MemoData: Buffer.from(params.memo, 'utf8').toString('hex').toUpperCase(),
        },
      }],
    }),
  };

  const result = await client.submitAndWait(tx, { wallet });

  const meta = result.result.meta;
  if (meta && typeof meta !== 'string' && (meta as { TransactionResult: string }).TransactionResult !== 'tesSUCCESS') {
    throw new Error(`XRPL payment failed: ${(meta as { TransactionResult: string }).TransactionResult}`);
  }

  return {
    txHash: result.result.hash,
    ledgerIndex: result.result.ledger_index ?? 0,
    amountDrops: params.amountDrops,
    destinationTag: params.destinationTag,
    // xrpl@4: Fee moved from result.result.Fee → result.result.tx_json.Fee (API v2)
    fee: (result.result as { tx_json?: { Fee?: string } }).tx_json?.Fee,
  };
}

export interface TestnetPaymentRequest {
  amountCents: number;
  xrpUsdRate: number;
  merchantAddress: string;
  customerSeed: string;
  destinationTag: number;
}

export async function executeTestnetPayment(req: TestnetPaymentRequest): Promise<PaymentResult> {
  const xrpAmount = usdCentsToXrp(req.amountCents, req.xrpUsdRate);
  const drops = xrpToDrops(xrpAmount);

  return sendPayment({
    fromSeed: req.customerSeed,
    toAddress: req.merchantAddress,
    amountDrops: drops,
    destinationTag: req.destinationTag,
    memo: `Acquis payment ${req.destinationTag}`,
  });
}

export { generateDestinationTag } from '../utils/currency';
