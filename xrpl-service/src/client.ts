import { Client } from 'xrpl';

const TESTNET_WSS = 'wss://s.altnet.rippletest.net:51233';

let _client: Client | null = null;

export async function getXrplClient(): Promise<Client> {
  if (_client?.isConnected()) return _client;
  _client = new Client(process.env.XRPL_WSS_URL ?? TESTNET_WSS);
  await _client.connect();
  return _client;
}

export async function disconnectXrplClient(): Promise<void> {
  if (_client?.isConnected()) {
    await _client.disconnect();
  }
  _client = null;
}
