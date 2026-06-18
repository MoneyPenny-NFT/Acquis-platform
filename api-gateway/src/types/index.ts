export interface CreateAccountBody {
  initialHbar?: number;
}

export interface CreateTokenBody {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  maxSupply?: number;
  treasuryAccountId: string;
  treasuryKey: string;
}

export interface MintTokenBody {
  supplyKey: string;
  amount: number;
}

export interface BurnTokenBody {
  supplyKey: string;
  amount: number;
}

export interface AssociateTokenBody {
  accountId: string;
  accountKey: string;
}

export interface TransferHbarBody {
  fromId: string;
  fromKey: string;
  toId: string;
  amount: number;
}

export interface TransferTokenBody {
  tokenId: string;
  fromId: string;
  fromKey: string;
  toId: string;
  amount: number;
}
