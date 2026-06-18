import { getXrplClient } from '../client';
import { dropsToXrp } from '../utils/currency';

export interface AccountInfo {
  address: string;
  xrpBalance: number;
  sequence: number;
}

export async function getAccountInfo(address: string): Promise<AccountInfo> {
  const client = await getXrplClient();
  const response = await client.request({
    command: 'account_info',
    account: address,
    ledger_index: 'validated',
  });
  return {
    address,
    xrpBalance: dropsToXrp(response.result.account_data.Balance),
    sequence: response.result.account_data.Sequence,
  };
}
