import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';

function getClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments;

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(config);
}

export async function createLinkToken(userId: string): Promise<string> {
  const res = await getClient().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Acquis',
    products: [Products.Auth],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return res.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const res = await getClient().itemPublicTokenExchange({ public_token: publicToken });
  return { accessToken: res.data.access_token, itemId: res.data.item_id };
}

export interface AccountInfo {
  institutionName: string;
  accounts: Array<{ accountId: string; mask: string; name: string; type: string }>;
}

export async function getAccountInfo(accessToken: string): Promise<AccountInfo> {
  const client = getClient();
  const [authRes, itemRes] = await Promise.all([
    client.authGet({ access_token: accessToken }),
    client.itemGet({ access_token: accessToken }),
  ]);

  let institutionName = 'Unknown Bank';
  const institutionId = itemRes.data.item.institution_id;
  if (institutionId) {
    const instRes = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    institutionName = instRes.data.institution.name;
  }

  return {
    institutionName,
    accounts: authRes.data.accounts.map(a => ({
      accountId: a.account_id,
      mask: a.mask ?? '????',
      name: a.name,
      type: a.type,
    })),
  };
}

export async function createStripeProcessorToken(
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await getClient().processorStripeBankAccountTokenCreate({
    access_token: accessToken,
    account_id: accountId,
  });
  return res.data.stripe_bank_account_token;
}

export async function removeItem(accessToken: string): Promise<void> {
  await getClient().itemRemove({ access_token: accessToken });
}
