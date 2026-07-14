import { PrismaClient } from '.prisma/credential-client';
import { NFTService } from '@acquis/hedera-service';
import type { AcquisCustomerNFT } from '@acquis/hedera-service';
import { createCredential, deleteCredential, verifyCredential, configureMerchantPreauth as xrplConfigurePreauth } from '@acquis/xrpl-service';

export interface EnrollParams {
  acquis_id: string;
  hedera_account_id: string;
  xrpl_address: string;
  tier: 'starter' | 'growth' | 'professional';
}

export interface CustomerEnrollmentResult {
  acquis_id: string;
  hedera_nft_token_id: string;
  hedera_nft_serial: number;
  xrpl_credential_tx_hash: string;
  xrpl_issuer_address: string;
  status: 'pending_acceptance' | 'active';
}

export interface MetadataUpdateParams {
  acquis_id: string;
  aqs_balance_delta: number;
  last_updated: string;
  reason: 'settlement' | 'tier_change' | 'network_join' | 'agent_policy_update' | 'suspension';
}

export class EnrollmentService {
  constructor(private readonly prisma: PrismaClient) {}

  async enroll(params: EnrollParams): Promise<CustomerEnrollmentResult> {
    const issuerAddress = process.env.XRPL_CREDENTIAL_ISSUER_ADDRESS ?? '';
    const now = new Date().toISOString();

    const metadata: AcquisCustomerNFT = {
      version: '1.0',
      acquis_id: params.acquis_id,
      xrpl_address: params.xrpl_address,
      tier: params.tier,
      aqs_balance: 0,
      network_memberships: [],
      agent_authorized: false,
      enrolled_at: now,
      last_updated: now,
      status: 'active',
    };

    const nftResult = await NFTService.mintCustomerNFT({
      customerHederaAccount: params.hedera_account_id,
      metadata,
    });

    const credentialResult = await createCredential({
      subjectAddress: params.xrpl_address,
      hederaNftTokenId: nftResult.token_id,
      hederaNftSerial: nftResult.serial_number,
    });

    await this.prisma.customerCredential.create({
      data: {
        acquis_id:           params.acquis_id,
        hedera_account_id:   params.hedera_account_id,
        xrpl_address:        params.xrpl_address,
        hedera_nft_token_id: nftResult.token_id,
        hedera_nft_serial:   nftResult.serial_number,
        xrpl_credential_tx:  credentialResult.txHash,
        tier:                params.tier,
        status:              'pending_acceptance',
      },
    });

    return {
      acquis_id:               params.acquis_id,
      hedera_nft_token_id:     nftResult.token_id,
      hedera_nft_serial:       nftResult.serial_number,
      xrpl_credential_tx_hash: credentialResult.txHash,
      xrpl_issuer_address:     issuerAddress,
      status:                  'pending_acceptance',
    };
  }

  async updateMetadata(params: MetadataUpdateParams): Promise<{ success: boolean; hedera_tx_id: string; new_aqs_balance: number }> {
    const record = await this.prisma.customerCredential.findUniqueOrThrow({
      where: { acquis_id: params.acquis_id },
    });

    const newBalance = Math.max(0, record.aqs_balance + params.aqs_balance_delta);
    const memberships: string[] = JSON.parse(record.network_memberships) as string[];

    const metadata: AcquisCustomerNFT = {
      version: '1.0',
      acquis_id:           record.acquis_id,
      xrpl_address:        record.xrpl_address,
      tier:                record.tier as AcquisCustomerNFT['tier'],
      aqs_balance:         newBalance,
      network_memberships: memberships,
      agent_authorized:    record.agent_authorized,
      agent_policy_id:     record.agent_policy_id ?? undefined,
      enrolled_at:         record.enrolled_at.toISOString(),
      last_updated:        params.last_updated,
      status:              record.status as AcquisCustomerNFT['status'],
    };

    const updateResult = await NFTService.updateNFTMetadata({
      tokenId:      record.hedera_nft_token_id,
      serialNumber: record.hedera_nft_serial,
      metadata,
    });

    await this.prisma.customerCredential.update({
      where: { acquis_id: params.acquis_id },
      data:  { aqs_balance: newBalance },
    });

    return {
      success:         true,
      hedera_tx_id:    updateResult.tx_id,
      new_aqs_balance: newBalance,
    };
  }

  async suspend(acquis_id: string): Promise<{ success: boolean }> {
    const record = await this.prisma.customerCredential.findUniqueOrThrow({
      where: { acquis_id },
    });

    const memberships: string[] = JSON.parse(record.network_memberships) as string[];

    const suspendedMetadata: AcquisCustomerNFT = {
      version: '1.0',
      acquis_id:           record.acquis_id,
      xrpl_address:        record.xrpl_address,
      tier:                record.tier as AcquisCustomerNFT['tier'],
      aqs_balance:         record.aqs_balance,
      network_memberships: memberships,
      agent_authorized:    record.agent_authorized,
      agent_policy_id:     record.agent_policy_id ?? undefined,
      enrolled_at:         record.enrolled_at.toISOString(),
      last_updated:        new Date().toISOString(),
      status:              'suspended',
    };

    await NFTService.updateNFTMetadata({
      tokenId:      record.hedera_nft_token_id,
      serialNumber: record.hedera_nft_serial,
      metadata:     suspendedMetadata,
    });

    await deleteCredential({
      subjectAddress:  record.xrpl_address,
      credentialType:  'AcquisMember',
    });

    await this.prisma.customerCredential.update({
      where: { acquis_id },
      data:  { status: 'suspended' },
    });

    return { success: true };
  }

  async getCredentialState(acquis_id: string) {
    const record = await this.prisma.customerCredential.findUniqueOrThrow({
      where: { acquis_id },
    });

    const [nftMetadata, xrplStatus] = await Promise.all([
      NFTService.getNFTMetadata(record.hedera_nft_token_id, record.hedera_nft_serial),
      verifyCredential({ accountAddress: record.xrpl_address }),
    ]);

    const expectedUri = `hedera:${record.hedera_nft_token_id}/${record.hedera_nft_serial}`;
    const crossChainLinkValid =
      xrplStatus.valid && xrplStatus.credential?.uri === expectedUri;

    return {
      nft_metadata:            nftMetadata,
      xrpl_credential_status:  xrplStatus,
      cross_chain_link_valid:  crossChainLinkValid,
    };
  }

  async configureMerchantPreauth(merchantXrplAddress: string): Promise<{ success: boolean; tx_hash: string }> {
    const merchantId = `merchant:${merchantXrplAddress}`;
    const result = await xrplConfigurePreauth({
      merchantAddress: merchantXrplAddress,
      merchantSeed:    process.env.XRPL_MERCHANT_SEED ?? '',
    });

    await this.prisma.merchantPreauth.upsert({
      where:  { merchant_id: merchantId },
      update: { preauth_configured: true, preauth_tx_hash: result.txHash, configured_at: new Date(), xrpl_address: merchantXrplAddress },
      create: { merchant_id: merchantId, xrpl_address: merchantXrplAddress, preauth_configured: true, preauth_tx_hash: result.txHash, configured_at: new Date() },
    });

    return { success: true, tx_hash: result.txHash };
  }
}
