import type { FastifyInstance } from 'fastify';
import { NFTService, HCSService } from '@acquis/hedera-service';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';

interface IssueBody {
  merchantId: string;
  customerContact: { phone?: string; email?: string };
  displayName?: string;
  rewardsConsent: boolean;
  marketingConsent?: { granted: boolean; channels: ('sms' | 'email')[] };
}

export async function credentialsIssueRoutes(app: FastifyInstance) {

  app.post<{ Body: IssueBody }>('/credentials/issue', async (request, reply) => {
    const { merchantId, customerContact, displayName, rewardsConsent, marketingConsent } = request.body;

    // Validate required fields
    if (!merchantId) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'merchantId is required' });
    }
    if (!customerContact?.phone && !customerContact?.email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request',
        message: 'customerContact.phone or customerContact.email is required' });
    }

    // LEGAL: rewards consent is REQUIRED for enrollment. Marketing consent is separate and optional.
    if (!rewardsConsent) {
      return reply.status(422).send({ statusCode: 422, error: 'Unprocessable Entity',
        message: 'rewardsConsent must be true — customer must explicitly accept the rewards program' });
    }

    // Marketing-only consent without rewards consent is rejected
    if (marketingConsent?.granted && !rewardsConsent) {
      return reply.status(422).send({ statusCode: 422, error: 'Unprocessable Entity',
        message: 'marketingConsent requires rewardsConsent — enroll in the rewards program first' });
    }

    if (!app.dbReady) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable',
        message: 'Database unavailable' });
    }

    // Check for existing customer by contact
    let existing = null;
    if (customerContact.phone) {
      existing = await app.prisma.acquisCustomer.findUnique({
        where: { phone: customerContact.phone },
      });
    }
    if (!existing && customerContact.email) {
      existing = await app.prisma.acquisCustomer.findUnique({
        where: { email: customerContact.email },
      });
    }

    if (existing) {
      return reply.status(200).send({
        acquisId:        existing.acquisId,
        status:          'existing',
        kycLevel:        existing.kycLevel,
        hederaNftTokenId: existing.hederaNftTokenId,
        hederaNftSerial:  existing.hederaNftSerial,
        message:         'Customer already enrolled — reward credited to existing credential',
      });
    }

    const now = new Date();

    // Mint custodial NFT (held by operator until customer provides Hedera account)
    let nftTokenId: string | null   = null;
    let nftSerial:  number | null   = null;

    const acquisId = generateAcquisId();

    try {
      const nftResult = await NFTService.mintCustodialNFT({
        version:             '1.0',
        acquis_id:           acquisId,
        xrpl_address:        '',
        tier:                'starter',
        aqs_balance:         0,
        network_memberships: [],
        agent_authorized:    false,
        enrolled_at:         now.toISOString(),
        last_updated:        now.toISOString(),
        status:              'active',
        kyc_level:           'rewards_only',
        marketing_consent:   marketingConsent?.granted ?? false,
        marketing_channels:  marketingConsent?.channels ?? [],
      } as any);

      nftTokenId = nftResult.token_id;
      nftSerial  = nftResult.serial_number;
    } catch (err) {
      // NFT mint failure is non-fatal for MVP — customer created in DB, NFT minted lazily
      app.log.warn({ err, acquisId }, 'Custodial NFT mint failed — customer enrolled without NFT');
    }

    // Create customer record
    const customer = await app.prisma.acquisCustomer.create({
      data: {
        acquisId,
        phone:                   customerContact.phone   ?? null,
        email:                   customerContact.email   ?? null,
        displayName:             displayName             ?? null,
        hederaNftTokenId:        nftTokenId,
        hederaNftSerial:         nftSerial,
        kycLevel:                'rewards_only',
        tier:                    'starter',
        enrollingMerchantId:     merchantId,
        rewardsConsentGranted:   true,
        rewardsConsentAt:        now,
        marketingConsentGranted: marketingConsent?.granted ?? false,
        marketingConsentChannels: JSON.stringify(marketingConsent?.channels ?? []),
        marketingConsentAt:      marketingConsent?.granted ? now : null,
        status:                  'active',
      },
    });

    // Write rewards consent HCS record (separate from marketing)
    let rewardsConsentSeq: number | undefined;
    try {
      const r = await HCSService.submitMessage({
        topic_id: HCS_TOPIC,
        message: JSON.stringify({
          type:       'consent.rewards',
          acquisId:   customer.acquisId,
          merchantId,
          granted:    true,
          timestamp:  now.toISOString(),
        }),
      });
      rewardsConsentSeq = r.sequence_number;
    } catch (err) {
      app.log.error({ err, acquisId: customer.acquisId }, 'HCS consent.rewards write failed');
    }

    // Write marketing consent HCS record ONLY if explicitly granted (separate record, separate consent)
    let marketingConsentSeq: number | undefined;
    if (marketingConsent?.granted) {
      try {
        const r = await HCSService.submitMessage({
          topic_id: HCS_TOPIC,
          message: JSON.stringify({
            type:      'consent.marketing',
            acquisId:  customer.acquisId,
            merchantId,
            granted:   true,
            channels:  marketingConsent.channels,
            scope:     'merchant',
            timestamp: now.toISOString(),
          }),
        });
        marketingConsentSeq = r.sequence_number;
      } catch (err) {
        app.log.error({ err, acquisId: customer.acquisId }, 'HCS consent.marketing write failed');
      }
    }

    // QR payload for customer wallet link
    const qrPayload = {
      type:     'acquis_enrollment',
      acquisId: customer.acquisId,
      merchantId,
    };

    return reply.status(201).send({
      acquisId:              customer.acquisId,
      status:                'enrolled',
      kycLevel:              'rewards_only',
      hederaNftTokenId:      nftTokenId,
      hederaNftSerial:       nftSerial,
      rewardsConsentHcsSeq:  rewardsConsentSeq  ?? null,
      marketingConsentHcsSeq: marketingConsentSeq ?? null,
      marketingConsentGranted: marketingConsent?.granted ?? false,
      qrPayload,
    });
  });
}

function generateAcquisId(): string {
  return 'acq_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
