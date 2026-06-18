import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';

let _client: Client | null = null;

export function getClient(): Client {
  if (_client) return _client;

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK ?? 'testnet';

  if (!operatorId || !operatorKey) {
    throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set');
  }

  if (network === 'mainnet') {
    throw new Error('Mainnet is not permitted — use testnet only');
  }

  // Keys prefixed with 0x are ECDSA (Hedera Portal default); others are ED25519
  const key = operatorKey.startsWith('0x') || operatorKey.startsWith('0X')
    ? PrivateKey.fromStringECDSA(operatorKey)
    : PrivateKey.fromString(operatorKey);

  _client = Client.forTestnet();
  _client.setOperator(AccountId.fromString(operatorId), key);
  _client.setRequestTimeout(10_000); // 10 s — fail fast on slow nodes

  return _client;
}

export function closeClient(): void {
  if (_client) {
    _client.close();
    _client = null;
  }
}
