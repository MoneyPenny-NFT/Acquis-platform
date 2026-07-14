import {
  createNFTCollection,
  mintCustomerNFT,
  updateNFTMetadata,
  getNFTMetadata,
} from '../src/services/nft.service';
import type { AcquisCustomerNFT, AcquisNFTMetadataRef } from '../src/services/nft.service';

jest.mock('../src/client', () => ({ getClient: jest.fn() }));

jest.mock('../src/services/hcs.service', () => ({
  submitMetadata: jest.fn().mockResolvedValue({ topic_id: '0.0.11111', sequence_number: 1 }),
  getMetadataFromHCS: jest.fn(),
}));

const SAMPLE_METADATA: AcquisCustomerNFT = {
  version: '1.0',
  acquis_id: 'acq-test-001',
  xrpl_address: 'rU2gCTb79SLxAaGPQkc5RYcAwzfhr4yLLq',
  tier: 'starter',
  aqs_balance: 0,
  network_memberships: [],
  agent_authorized: false,
  enrolled_at: new Date().toISOString(),
  last_updated: new Date().toISOString(),
  status: 'active',
};

describe('NFTService', () => {
  it('exports all required functions', () => {
    expect(typeof createNFTCollection).toBe('function');
    expect(typeof mintCustomerNFT).toBe('function');
    expect(typeof updateNFTMetadata).toBe('function');
    expect(typeof getNFTMetadata).toBe('function');
  });

  it('createNFTCollection returns existing token_id when ACQUIS_NFT_TOKEN_ID is set', async () => {
    process.env.ACQUIS_NFT_TOKEN_ID = '0.0.9999999';
    const result = await createNFTCollection();
    expect(result.token_id).toBe('0.0.9999999');
    delete process.env.ACQUIS_NFT_TOKEN_ID;
  });

  it('mintCustomerNFT throws when HEDERA_OPERATOR_ID is not set', async () => {
    delete process.env.ACQUIS_NFT_TOKEN_ID;
    delete process.env.HEDERA_OPERATOR_ID;
    await expect(
      mintCustomerNFT({ customerHederaAccount: '0.0.123', metadata: SAMPLE_METADATA }),
    ).rejects.toThrow('HEDERA_OPERATOR_ID must be set');
  });

  it('AcquisNFTMetadataRef serialises to fewer than 100 bytes', () => {
    const ref: AcquisNFTMetadataRef = { hcs: '0.0.9342217', seq: 999 };
    const bytes = Buffer.from(JSON.stringify(ref));
    expect(bytes.length).toBeLessThan(100);
  });

  it('AcquisCustomerNFT metadata schema round-trips through JSON', () => {
    const serialised   = JSON.stringify(SAMPLE_METADATA);
    const deserialised = JSON.parse(serialised) as AcquisCustomerNFT;
    expect(deserialised.version).toBe('1.0');
    expect(deserialised.tier).toBe('starter');
    expect(deserialised.status).toBe('active');
    expect(Array.isArray(deserialised.network_memberships)).toBe(true);
  });
});
