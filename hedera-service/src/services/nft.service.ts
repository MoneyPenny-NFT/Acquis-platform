import {
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenUpdateNftsTransaction,
  TokenNftInfoQuery,
  TransferTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
  AccountId,
  TokenId,
  NftId,
  Status,
} from '@hashgraph/sdk';
import Long from 'long';
import { getClient } from '../client';
import { submitMetadata, getMetadataFromHCS } from './hcs.service';

export interface AcquisCustomerNFT {
  version: '1.0';
  acquis_id: string;
  xrpl_address: string;
  tier: 'starter' | 'growth' | 'professional';
  aqs_balance: number;
  network_memberships: string[];
  agent_authorized: boolean;
  agent_policy_id?: string;
  enrolled_at: string;
  last_updated: string;
  status: 'active' | 'suspended';
}

// What is stored in the 100-byte on-chain metadata field
export interface AcquisNFTMetadataRef {
  hcs: string;   // HCS topic ID e.g. "0.0.12345"
  seq: number;   // HCS sequence number
}

export interface NFTMintParams {
  customerHederaAccount: string;
  metadata: AcquisCustomerNFT;
}

export interface NFTMintResult {
  token_id: string;
  serial_number: number;
  tx_id: string;
  hcs_topic_id: string;
  hcs_sequence_number: number;
}

export interface NFTUpdateParams {
  tokenId: string;
  serialNumber: number;
  metadata: AcquisCustomerNFT;
}

export interface NFTUpdateResult {
  tx_id: string;
  new_metadata: AcquisCustomerNFT;
  hcs_topic_id: string;
  hcs_sequence_number: number;
}

function getOperatorKey(): PrivateKey {
  const raw = process.env.HEDERA_OPERATOR_KEY ?? '';
  return raw.startsWith('0x') || raw.startsWith('0X')
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(raw);
}

export async function createNFTCollection(): Promise<{ token_id: string }> {
  const existing = process.env.ACQUIS_NFT_TOKEN_ID;
  if (existing) return { token_id: existing };

  const client  = getClient();
  const key     = getOperatorKey();
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  if (!operatorId) throw new Error('HEDERA_OPERATOR_ID must be set');

  const tx = await new TokenCreateTransaction()
    .setTokenName('Acquis Customer Identity')
    .setTokenSymbol('AQCID')
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setInitialSupply(0)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .setSupplyKey(key.publicKey)
    .setMetadataKey(key.publicKey)
    .setAdminKey(key.publicKey)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`NFT collection creation failed: ${receipt.status}`);
  }

  return { token_id: receipt.tokenId!.toString() };
}

export async function mintCustomerNFT(params: NFTMintParams): Promise<NFTMintResult> {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const tokenId    = process.env.ACQUIS_NFT_TOKEN_ID;
  if (!operatorId) throw new Error('HEDERA_OPERATOR_ID must be set');
  if (!tokenId)    throw new Error('ACQUIS_NFT_TOKEN_ID must be set — run create-collection first');

  // Write full metadata to HCS; store 32-byte ref on-chain
  const hcsResult = await submitMetadata(params.metadata);
  const ref: AcquisNFTMetadataRef = { hcs: hcsResult.topic_id, seq: hcsResult.sequence_number };
  const metadataBytes = Buffer.from(JSON.stringify(ref));

  const client = getClient();
  const key    = getOperatorKey();

  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .addMetadata(metadataBytes)
    .freezeWith(client)
    .sign(key);

  const mintResponse = await mintTx.execute(client);
  const mintReceipt  = await mintResponse.getReceipt(client);

  if (mintReceipt.status !== Status.Success) {
    throw new Error(`NFT mint failed: ${mintReceipt.status}`);
  }

  const serialNumber = mintReceipt.serials[0].toNumber();
  const txId = mintResponse.transactionId.toString();

  const transferTx = await new TransferTransaction()
    .addNftTransfer(
      new NftId(TokenId.fromString(tokenId), serialNumber),
      AccountId.fromString(operatorId),
      AccountId.fromString(params.customerHederaAccount),
    )
    .freezeWith(client)
    .sign(key);

  const transferResponse = await transferTx.execute(client);
  const transferReceipt  = await transferResponse.getReceipt(client);

  if (transferReceipt.status !== Status.Success) {
    throw new Error(`NFT transfer to customer failed: ${transferReceipt.status}`);
  }

  return {
    token_id: tokenId,
    serial_number: serialNumber,
    tx_id: txId,
    hcs_topic_id: hcsResult.topic_id,
    hcs_sequence_number: hcsResult.sequence_number,
  };
}

// Mints NFT to the operator account (custodial). Used for rewards_only enrollments
// where the customer has no Hedera account yet. No transfer step.
export async function mintCustodialNFT(metadata: AcquisCustomerNFT & { kyc_level?: string; marketing_consent?: boolean; marketing_channels?: string[] }): Promise<NFTMintResult> {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const tokenId    = process.env.ACQUIS_NFT_TOKEN_ID;
  if (!operatorId) throw new Error('HEDERA_OPERATOR_ID must be set');
  if (!tokenId)    throw new Error('ACQUIS_NFT_TOKEN_ID must be set — run create-collection first');

  const hcsResult = await submitMetadata(metadata as AcquisCustomerNFT);
  const ref: AcquisNFTMetadataRef = { hcs: hcsResult.topic_id, seq: hcsResult.sequence_number };
  const metadataBytes = Buffer.from(JSON.stringify(ref));

  const client = getClient();
  const key    = getOperatorKey();

  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .addMetadata(metadataBytes)
    .freezeWith(client)
    .sign(key);

  const mintResponse = await mintTx.execute(client);
  const mintReceipt  = await mintResponse.getReceipt(client);

  if (mintReceipt.status !== Status.Success) {
    throw new Error(`Custodial NFT mint failed: ${mintReceipt.status}`);
  }

  return {
    token_id: tokenId,
    serial_number: mintReceipt.serials[0].toNumber(),
    tx_id: mintResponse.transactionId.toString(),
    hcs_topic_id: hcsResult.topic_id,
    hcs_sequence_number: hcsResult.sequence_number,
  };
}

export async function updateNFTMetadata(params: NFTUpdateParams): Promise<NFTUpdateResult> {
  // Write new metadata version to HCS; update on-chain ref via HIP-657
  const hcsResult = await submitMetadata(params.metadata);
  const ref: AcquisNFTMetadataRef = { hcs: hcsResult.topic_id, seq: hcsResult.sequence_number };
  const metadataBytes = Buffer.from(JSON.stringify(ref));

  const client = getClient();
  const key    = getOperatorKey();

  const tx = await new TokenUpdateNftsTransaction()
    .setTokenId(params.tokenId)
    .setSerialNumbers([Long.fromNumber(params.serialNumber)])
    .setMetadata(metadataBytes)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`NFT metadata update failed: ${receipt.status}`);
  }

  return {
    tx_id: response.transactionId.toString(),
    new_metadata: params.metadata,
    hcs_topic_id: hcsResult.topic_id,
    hcs_sequence_number: hcsResult.sequence_number,
  };
}

export async function getNFTMetadata(
  tokenId: string,
  serial: number,
): Promise<AcquisCustomerNFT> {
  const client = getClient();

  const info = await new TokenNftInfoQuery()
    .setNftId(new NftId(TokenId.fromString(tokenId), serial))
    .execute(client);

  const nftInfo = Array.isArray(info) ? info[0] : info;
  if (!nftInfo?.metadata) throw new Error('No metadata found for NFT');

  const raw = Buffer.isBuffer(nftInfo.metadata)
    ? nftInfo.metadata.toString('utf8')
    : Buffer.from(nftInfo.metadata).toString('utf8');

  const ref = JSON.parse(raw) as AcquisNFTMetadataRef;
  return getMetadataFromHCS(ref.hcs, ref.seq);
}
