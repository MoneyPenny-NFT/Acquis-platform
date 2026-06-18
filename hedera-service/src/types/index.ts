export interface AccountCreateResult {
  accountId: string;
  privateKey: string;
  publicKey: string;
}

export interface TokenCreateResult {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
}

export interface TokenCreateParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  maxSupply?: number;
  treasuryAccountId: string;
  treasuryKey: string;
}
