import {
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
  AccountId,
  TokenId,
  Status,
} from '@hashgraph/sdk';
import { getClient } from '../client';
import type { TokenCreateParams, TokenCreateResult } from '../types';

export async function createToken(params: TokenCreateParams): Promise<TokenCreateResult> {
  const client = getClient();
  const treasuryKey = PrivateKey.fromString(params.treasuryKey);

  const txBuilder = new TokenCreateTransaction()
    .setTokenName(params.name)
    .setTokenSymbol(params.symbol)
    .setDecimals(params.decimals)
    .setInitialSupply(params.initialSupply)
    .setTreasuryAccountId(AccountId.fromString(params.treasuryAccountId))
    .setAdminKey(treasuryKey.publicKey)
    .setSupplyKey(treasuryKey.publicKey)
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(params.maxSupply ? TokenSupplyType.Finite : TokenSupplyType.Infinite);

  if (params.maxSupply) {
    txBuilder.setMaxSupply(params.maxSupply);
  }

  const tx = await txBuilder.freezeWith(client).sign(treasuryKey);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`Token creation failed: ${receipt.status}`);
  }

  return {
    tokenId: receipt.tokenId!.toString(),
    name: params.name,
    symbol: params.symbol,
    decimals: params.decimals,
    initialSupply: params.initialSupply,
  };
}

export async function associateToken(
  accountId: string,
  accountKey: string,
  tokenIds: string[],
): Promise<void> {
  const client = getClient();
  const key = PrivateKey.fromString(accountKey);

  const tx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds(tokenIds)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`Token association failed: ${receipt.status}`);
  }
}

export async function mintTokens(tokenId: string, supplyKey: string, amount: number) {
  const client = getClient();
  const key = PrivateKey.fromString(supplyKey);

  const tx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  return response.getReceipt(client);
}

export async function burnTokens(tokenId: string, supplyKey: string, amount: number) {
  const client = getClient();
  const key = PrivateKey.fromString(supplyKey);

  const tx = await new TokenBurnTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .setAmount(amount)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  return response.getReceipt(client);
}
