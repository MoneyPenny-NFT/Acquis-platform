import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  IdentityVerificationStatus,
} from 'plaid';

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? 'sandbox';

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET are required');
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(config);
}

export interface IDVCreateResult {
  idv_id: string;
  shareable_url: string;
  status: string;
}

export async function createIDVSession(email: string): Promise<IDVCreateResult> {
  const client = getPlaidClient();
  const templateId = process.env.PLAID_IDV_TEMPLATE_ID;
  if (!templateId) throw new Error('PLAID_IDV_TEMPLATE_ID is required');

  const response = await client.identityVerificationCreate({
    template_id: templateId,
    is_shareable: true,
    gave_consent: true,
    user: {
      email_address: email,
      client_user_id: `acquis-${Date.now()}`,
    },
  });

  return {
    idv_id: response.data.id,
    shareable_url: response.data.shareable_url ?? '',
    status: response.data.status,
  };
}

export interface IDVResult {
  status: string;
  legal_name: string | null;
  date_of_birth: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal: string | null;
  documentary_status: string | null;
  selfie_status: string | null;
}

export async function getIDVResult(idvId: string): Promise<IDVResult> {
  const client = getPlaidClient();
  const response = await client.identityVerificationGet({ identity_verification_id: idvId });
  const d = response.data;

  const name = d.user.name;
  const addr = d.user.address;

  return {
    status: d.status,
    legal_name: name ? `${name.given_name ?? ''} ${name.family_name ?? ''}`.trim() || null : null,
    date_of_birth: d.user.date_of_birth ?? null,
    address_city: addr?.city ?? null,
    address_region: addr?.region ?? null,
    address_postal: addr?.postal_code ?? null,
    documentary_status: d.documentary_verification?.status ?? null,
    selfie_status: d.selfie_check?.status ?? null,
  };
}

export function isIDVSuccess(status: string): boolean {
  return status === IdentityVerificationStatus.Success;
}

export interface LinkTokenResult {
  link_token: string;
  expiration: string;
}

export async function createLinkToken(clientUserId: string): Promise<LinkTokenResult> {
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: clientUserId },
    client_name: 'Acquis',
    products: [Products.Auth, Products.Identity],
    country_codes: [CountryCode.Us],
    language: 'en',
  });

  return {
    link_token: response.data.link_token,
    expiration: response.data.expiration,
  };
}

export interface BankLinkResult {
  item_id: string;
  account_mask: string | null;
  account_type: string | null;
  institution_name: string | null;
  identity_match_status: string;
  identity_match_score: number | null;
}

export async function exchangePublicToken(
  publicToken: string,
  legalName: string,
): Promise<BankLinkResult> {
  const client = getPlaidClient();

  const exchangeResponse = await client.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;

  const [authResponse, identityMatchResponse] = await Promise.all([
    client.authGet({ access_token: accessToken }),
    client.identityMatch({
      access_token: accessToken,
      user: { legal_name: legalName },
    }),
  ]);

  // DO NOT persist accessToken — use processor tokens for downstream systems
  const account = authResponse.data.accounts[0];
  const matchAccount = identityMatchResponse.data.accounts?.[0];

  const nameMatch = matchAccount?.legal_name;
  const matchScore = nameMatch?.score ?? null;
  const matchStatus = (matchScore ?? 0) >= 90 ? 'match' : 'no_match';

  return {
    item_id: itemId,
    account_mask: account?.mask ?? null,
    account_type: account?.subtype ?? null,
    institution_name: authResponse.data.item.institution_id ?? null,
    identity_match_status: matchStatus,
    identity_match_score: matchScore,
  };
}
