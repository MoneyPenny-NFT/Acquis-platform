import { EnrollmentService } from '../src/services/enrollment.service';

// Stub adapters — same pattern as StubHederaClient in funding-service
jest.mock('@acquis/hedera-service', () => ({
  NFTService: {
    mintCustomerNFT: jest.fn().mockResolvedValue({
      token_id: '0.0.9199123',
      serial_number: 1,
      tx_id: 'stub-hedera-mint-tx',
    }),
    updateNFTMetadata: jest.fn().mockResolvedValue({
      tx_id: 'stub-hedera-update-tx',
      new_metadata: {},
    }),
    getNFTMetadata: jest.fn().mockResolvedValue({
      version: '1.0',
      acquis_id: 'acq-001',
      xrpl_address: 'rSubject',
      tier: 'starter',
      aqs_balance: 100,
      network_memberships: [],
      agent_authorized: false,
      enrolled_at: '2026-01-01T00:00:00.000Z',
      last_updated: '2026-01-01T00:00:00.000Z',
      status: 'active',
    }),
  },
}));

jest.mock('@acquis/xrpl-service', () => ({
  createCredential: jest.fn().mockResolvedValue({
    txHash: 'stub-credential-create-123',
    credentialId: 'rIssuer:rSubject:4163717569734d656d626572',
  }),
  deleteCredential: jest.fn().mockResolvedValue({ txHash: 'stub-credential-delete-123' }),
  verifyCredential: jest.fn().mockResolvedValue({
    valid: true,
    credential: {
      issuer: 'rIssuer',
      subject: 'rSubject',
      credential_type: 'AcquisMember',
      uri: 'hedera:0.0.9199123/1',
    },
  }),
  configureMerchantPreauth: jest.fn().mockResolvedValue({ txHash: 'stub-preauth-123' }),
}));

function buildMockPrisma() {
  const store: Record<string, unknown> = {};
  return {
    customerCredential: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        store[data.acquis_id as string] = { ...data, enrolled_at: new Date(), last_updated: new Date(), aqs_balance: 0, network_memberships: '[]', agent_authorized: false, agent_policy_id: null };
        return Promise.resolve(store[data.acquis_id as string]);
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }: { where: { acquis_id: string } }) => {
        const record = store[where.acquis_id];
        if (!record) throw new Error(`CustomerCredential not found: ${where.acquis_id}`);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data }: { where: { acquis_id: string }; data: Record<string, unknown> }) => {
        store[where.acquis_id] = { ...(store[where.acquis_id] as object), ...data };
        return Promise.resolve(store[where.acquis_id]);
      }),
    },
    merchantPreauth: {
      upsert: jest.fn().mockResolvedValue({ id: 'mp-1', preauth_configured: true }),
    },
  };
}

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS = 'rIssuer';
    process.env.ACQUIS_NFT_TOKEN_ID = '0.0.9199123';
    prisma  = buildMockPrisma();
    service = new EnrollmentService(prisma as unknown as import('.prisma/credential-client').PrismaClient);
  });

  afterEach(() => jest.clearAllMocks());

  it('enroll — mints NFT on Hedera and issues credential on XRPL', async () => {
    const result = await service.enroll({
      acquis_id:         'acq-001',
      hedera_account_id: '0.0.9218284',
      xrpl_address:      'rSubject',
      tier:              'starter',
    });
    expect(result.hedera_nft_token_id).toBe('0.0.9199123');
    expect(result.hedera_nft_serial).toBe(1);
    expect(result.xrpl_credential_tx_hash).toMatch(/stub-credential-create/);
    expect(result.status).toBe('pending_acceptance');
  });

  it('updateMetadata — AQS balance increments correctly after payment', async () => {
    await service.enroll({ acquis_id: 'acq-002', hedera_account_id: '0.0.9218284', xrpl_address: 'rSubject', tier: 'starter' });
    const result = await service.updateMetadata({
      acquis_id:         'acq-002',
      aqs_balance_delta: 50,
      last_updated:      new Date().toISOString(),
      reason:            'settlement',
    });
    expect(result.success).toBe(true);
    expect(result.new_aqs_balance).toBe(50);
  });

  it('suspend — updates NFT status and deletes XRPL credential', async () => {
    const { deleteCredential } = jest.requireMock('@acquis/xrpl-service') as { deleteCredential: jest.Mock };
    const { NFTService }       = jest.requireMock('@acquis/hedera-service') as { NFTService: { updateNFTMetadata: jest.Mock } };

    await service.enroll({ acquis_id: 'acq-003', hedera_account_id: '0.0.9218284', xrpl_address: 'rSubject', tier: 'starter' });
    const result = await service.suspend('acq-003');

    expect(result.success).toBe(true);
    expect(NFTService.updateNFTMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'suspended' }) }),
    );
    expect(deleteCredential).toHaveBeenCalled();
  });

  it('getCredentialState — returns live on-chain status and validates cross-chain link', async () => {
    await service.enroll({ acquis_id: 'acq-004', hedera_account_id: '0.0.9218284', xrpl_address: 'rSubject', tier: 'starter' });
    const state = await service.getCredentialState('acq-004');
    expect(state.xrpl_credential_status.valid).toBe(true);
    expect(state.cross_chain_link_valid).toBe(true);
  });

  it('configureMerchantPreauth — stores preauth record and returns tx_hash', async () => {
    const result = await service.configureMerchantPreauth('rMerchant');
    expect(result.success).toBe(true);
    expect(result.tx_hash).toMatch(/stub-preauth/);
    expect(prisma.merchantPreauth.upsert).toHaveBeenCalled();
  });
});
