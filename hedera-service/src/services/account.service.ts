import {
  AccountCreateTransaction,
  AccountInfoQuery,
  PrivateKey,
  Hbar,
  Status,
} from '@hashgraph/sdk';
import { getClient } from '../client';
import type { AccountCreateResult } from '../types';

export async function createAccount(initialHbar = 10): Promise<AccountCreateResult> {
  const client = getClient();
  const newKey = PrivateKey.generateED25519();

  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(initialHbar))
    .execute(client);

  const receipt = await tx.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`Account creation failed: ${receipt.status}`);
  }

  return {
    accountId: receipt.accountId!.toString(),
    privateKey: newKey.toString(),
    publicKey: newKey.publicKey.toString(),
  };
}

export async function getAccountInfo(accountId: string) {
  const client = getClient();
  return new AccountInfoQuery()
    .setAccountId(accountId)
    .execute(client);
}
