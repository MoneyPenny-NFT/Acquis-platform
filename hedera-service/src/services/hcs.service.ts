import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey,
} from '@hashgraph/sdk';
import { getClient } from '../client';
import type { AcquisCustomerNFT } from './nft.service';

export interface HCSSubmitResult {
  topic_id: string;
  sequence_number: number;
}

function getOperatorKey(): PrivateKey {
  const raw = process.env.HEDERA_OPERATOR_KEY ?? '';
  return raw.startsWith('0x') || raw.startsWith('0X')
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(raw);
}

export async function createMetadataTopic(): Promise<{ topic_id: string }> {
  const existing = process.env.ACQUIS_METADATA_TOPIC_ID;
  if (existing) return { topic_id: existing };

  const client = getClient();
  const key = getOperatorKey();

  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Acquis Customer Metadata')
    .setSubmitKey(key.publicKey)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) throw new Error('HCS topic creation failed — no topicId in receipt');
  return { topic_id: receipt.topicId.toString() };
}

export async function submitMetadata(metadata: AcquisCustomerNFT): Promise<HCSSubmitResult> {
  const topicId = process.env.ACQUIS_METADATA_TOPIC_ID;
  if (!topicId) throw new Error('ACQUIS_METADATA_TOPIC_ID must be set — run create-metadata-topic first');

  const client = getClient();
  const key = getOperatorKey();

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(metadata))
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicSequenceNumber) throw new Error('HCS submit failed — no sequence number in receipt');

  return {
    topic_id: topicId,
    sequence_number: receipt.topicSequenceNumber.toNumber(),
  };
}

export interface HCSWriteParams {
  topic_id: string;
  message: string;
  submit_key?: string;
}

export interface HCSWriteResult {
  topic_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  transaction_id: string;
}

export async function submitMessage(params: HCSWriteParams): Promise<HCSWriteResult> {
  const client = getClient();
  const key = params.submit_key
    ? (params.submit_key.startsWith('0x') || params.submit_key.startsWith('0X')
        ? PrivateKey.fromStringECDSA(params.submit_key)
        : PrivateKey.fromString(params.submit_key))
    : getOperatorKey();

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(params.topic_id)
    .setMessage(params.message)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const record = await response.getRecord(client);

  const ts = record.consensusTimestamp;
  const consensusTimestamp = new Date(
    ts.seconds.toNumber() * 1000 + Math.floor(ts.nanos.toNumber() / 1_000_000),
  ).toISOString();

  const seqNum = record.receipt.topicSequenceNumber;
  if (!seqNum) throw new Error('HCS submitMessage failed — no sequence number in record');

  return {
    topic_id:            params.topic_id,
    sequence_number:     seqNum.toNumber(),
    consensus_timestamp: consensusTimestamp,
    transaction_id:      response.transactionId.toString(),
  };
}

// Raw shape of a mirror-node topic message. Multi-chunk messages have
// `chunk_info.total > 1` and each chunk gets its own sequence_number.
// All chunks of one logical message share the same initial_transaction_id.
export interface MirrorTopicMessage {
  sequence_number:     number;
  consensus_timestamp: string;
  message:             string; // base64
  chunk_info?: {
    initial_transaction_id: {
      account_id:              string;
      nonce:                   number;
      scheduled:               boolean;
      transaction_valid_start: string;
    };
    number: number;
    total:  number;
  };
}

// The stitched, decoded HCS message + metadata about how it was assembled.
export interface HcsMessage {
  topicId:             string;
  firstSequenceNumber: number;
  chunkCount:          number;
  text:                string; // utf-8 decoded, chunks concatenated in order
  consensusTimestamp:  string; // from the first chunk
}

function mirrorBaseUrl(): string {
  const network = process.env.HEDERA_NETWORK ?? 'testnet';
  return network === 'mainnet'
    ? 'https://mainnet-public.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com';
}

// Shared reader — the ONLY correct way to fetch an HCS message that any
// downstream consumer should call. HCS auto-chunks messages larger than
// ~1024 bytes into consecutive sequence_numbers that share one
// initial_transaction_id. Reading only the seeded sequence returns
// TRUNCATED payload and will fail JSON.parse (or silently be wrong).
//
// This function detects chunking via chunk_info.total and walks forward
// through the next N-1 sequence numbers, verifying each subsequent chunk
// carries the SAME initial_transaction_id before concatenating.
//
// Use this from api-gateway routes, dashboard readback code, analytics,
// audit tooling — anywhere HCS messages get read back from the mirror
// node. Do NOT hand-roll fetch/base64/parse in new code.
export async function readHcsMessage(
  topicId:        string,
  sequenceNumber: number,
): Promise<HcsMessage> {
  const base = mirrorBaseUrl();

  async function fetchOne(seq: number): Promise<MirrorTopicMessage> {
    const res = await fetch(`${base}/api/v1/topics/${topicId}/messages/${seq}`);
    if (!res.ok) throw new Error(`Mirror Node ${res.status} for topic ${topicId} seq ${seq}`);
    return (await res.json()) as MirrorTopicMessage;
  }

  const first = await fetchOne(sequenceNumber);
  const total = first.chunk_info?.total ?? 1;

  if (total === 1) {
    return {
      topicId,
      firstSequenceNumber: sequenceNumber,
      chunkCount:          1,
      text:                Buffer.from(first.message, 'base64').toString('utf8'),
      consensusTimestamp:  first.consensus_timestamp,
    };
  }

  // Multi-chunk. Walk forward through the next total-1 sequences and
  // verify each carries the same initial_transaction_id before joining.
  const expectedItx = first.chunk_info!.initial_transaction_id;
  const chunks: Buffer[] = [Buffer.from(first.message, 'base64')];

  for (let i = 1; i < total; i++) {
    const nextSeq = sequenceNumber + i;
    const chunk   = await fetchOne(nextSeq);
    const itx     = chunk.chunk_info?.initial_transaction_id;
    if (!itx ||
        itx.account_id !== expectedItx.account_id ||
        itx.transaction_valid_start !== expectedItx.transaction_valid_start ||
        chunk.chunk_info?.number !== i + 1) {
      throw new Error(
        `HCS chunk stitching failed for topic ${topicId} seq ${sequenceNumber}: ` +
        `expected chunk ${i + 1}/${total} with initial_transaction_id ` +
        `${expectedItx.account_id}@${expectedItx.transaction_valid_start} ` +
        `at seq ${nextSeq}, got mismatch or missing`,
      );
    }
    chunks.push(Buffer.from(chunk.message, 'base64'));
  }

  return {
    topicId,
    firstSequenceNumber: sequenceNumber,
    chunkCount:          total,
    text:                Buffer.concat(chunks).toString('utf8'),
    consensusTimestamp:  first.consensus_timestamp,
  };
}

// Convenience helper for the common "read + JSON.parse" pattern. Uses
// readHcsMessage under the hood — inherits chunk stitching for free.
export async function readHcsJson<T = unknown>(
  topicId:        string,
  sequenceNumber: number,
): Promise<T> {
  const m = await readHcsMessage(topicId, sequenceNumber);
  return JSON.parse(m.text) as T;
}

// Preserved for callers that still expect the AcquisCustomerNFT shape.
// New code should call readHcsJson<AcquisCustomerNFT>(topicId, seq) instead;
// this wrapper stays for backwards compatibility with existing consumers.
export async function getMetadataFromHCS(
  topicId:        string,
  sequenceNumber: number,
): Promise<AcquisCustomerNFT> {
  return readHcsJson<AcquisCustomerNFT>(topicId, sequenceNumber);
}
