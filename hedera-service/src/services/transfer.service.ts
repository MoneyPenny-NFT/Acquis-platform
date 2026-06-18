import {
  TransferTransaction,
  AccountId,
  TokenId,
  Hbar,
  PrivateKey,
  Status,
} from '@hashgraph/sdk';
import { getClient } from '../client';

export async function transferHbar(
  fromId: string,
  fromKey: string,
  toId: string,
  amount: number,
): Promise<void> {
  const client = getClient();
  const key = PrivateKey.fromString(fromKey);

  const tx = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(fromId), new Hbar(-amount))
    .addHbarTransfer(AccountId.fromString(toId), new Hbar(amount))
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`HBAR transfer failed: ${receipt.status}`);
  }
}

export async function transferToken(
  tokenId: string,
  fromId: string,
  fromKey: string,
  toId: string,
  amount: number,
): Promise<void> {
  const client = getClient();
  const key = PrivateKey.fromString(fromKey);

  const tx = await new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(fromId), -amount)
    .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(toId), amount)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`Token transfer failed: ${receipt.status}`);
  }
}
