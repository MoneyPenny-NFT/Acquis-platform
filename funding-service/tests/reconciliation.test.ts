/**
 * Reconciliation tests.
 * - Unmatched credits aged > 1 h are swept to the review queue.
 * - Credits matching no RfP stay unmatched until swept.
 * - FIFO matching: oldest approved request is matched first.
 */

import { FundingService } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Unmatched-credit reconciliation', () => {
  let db: ReturnType<typeof createMockPrisma>;
  let bank: MockBankAdapter;
  let service: FundingService;
  let approvalId: string;

  beforeEach(async () => {
    db      = createMockPrisma();
    bank    = new MockBankAdapter();
    service = new FundingService(db as never, bank, createMockHederaClient());
    bank.setWebhookHandler(event => service.handleWebhookEvent(event));
    approvalId = await seedStandingApproval(db);
  });

  it('unmatched credit with no corresponding RfP stays unmatched', async () => {
    await bank.fireUnmatchedCredit(99_00);

    const credits = db._stores.inboundCredits.findMany({});
    expect(credits).toHaveLength(1);
    expect(credits[0].status).toBe('unmatched');
  });

  it('sweepUnmatchedCredits moves old unmatched credits to reviewed', async () => {
    await bank.fireUnmatchedCredit(99_00);

    // Backdate receivedAt to 2 hours ago
    const credits = db._stores.inboundCredits.findMany({});
    db._stores.inboundCredits.update({
      where: { id: credits[0].id as string },
      data:  { receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const swept = await service.sweepUnmatchedCredits();
    expect(swept).toBe(1);

    const updated = db._stores.inboundCredits.findMany({});
    expect(updated[0].status).toBe('reviewed');
  });

  it('sweepUnmatchedCredits does not sweep recent credits', async () => {
    await bank.fireUnmatchedCredit(99_00); // just arrived

    const swept = await service.sweepUnmatchedCredits();
    expect(swept).toBe(0);

    const credits = db._stores.inboundCredits.findMany({});
    expect(credits[0].status).toBe('unmatched');
  });

  it('credit arriving after approval matches to the RfP (settled → credited)', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'recon-001',
      hederaAccountId:   '0.0.12345',
      amountCents:       40_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 40_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 40_00);

    // Credit arrives with a different providerRef (new incoming wire)
    await bank.fireEvent('credit.received', 'wire-credit-001', 40_00);

    const final = await service.getFundingRequest(req.id);
    expect(final!.state).toBe('credited');
    expect(final!.matchedCreditId).toBeTruthy();

    const credit = db._stores.inboundCredits.findMany({})[0];
    expect(credit.status).toBe('matched');
    expect(credit.matchedRequestId).toBe(req.id);
  });

  it('FIFO matching: oldest approved request is matched first', async () => {
    // Two approved requests for the same amount
    const r1 = await service.createRfP({
      idempotencyKey:    'recon-fifo-1',
      hederaAccountId:   '0.0.12345',
      amountCents:       30_00,
      standingApprovalId: approvalId,
    });
    const r2 = await service.createRfP({
      idempotencyKey:    'recon-fifo-2',
      hederaAccountId:   '0.0.12345',
      amountCents:       30_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', r1.providerRef!, 30_00);
    await bank.fireEvent('rfp.approved', r1.providerRef!, 30_00);
    await bank.fireEvent('rfp.presented', r2.providerRef!, 30_00);
    await bank.fireEvent('rfp.approved', r2.providerRef!, 30_00);

    // One credit arrives — should match r1 (oldest)
    await bank.fireEvent('credit.received', 'wire-fifo-001', 30_00);

    const final1 = await service.getFundingRequest(r1.id);
    const final2 = await service.getFundingRequest(r2.id);

    expect(final1!.state).toBe('credited');
    expect(final2!.state).toBe('approved'); // still waiting
  });

  it('retryFailedHcsWrites retries pending HCS records', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'recon-hcs-retry',
      hederaAccountId:   '0.0.12345',
      amountCents:       20_00,
      standingApprovalId: approvalId,
    });

    // Manually set a pending HCS write to simulate a previous failure
    db._stores.fundingRequests.update({
      where: { id: req.id },
      data:  {
        hcsPendingWrite: JSON.stringify({ type: 'credit.matched', creditId: 'c-1' }),
      },
    });

    const hedera = createMockHederaClient();
    service = new FundingService(db as never, bank, hedera);

    const retried = await service.retryFailedHcsWrites();
    expect(retried).toBe(1);
    expect(hedera.writeHcs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'credit.matched' }),
    );

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.hcsPendingWrite).toBeNull();
  });
});
