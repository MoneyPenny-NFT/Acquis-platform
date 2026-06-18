/**
 * Webhook idempotency tests.
 * Duplicate webhooks must not cause duplicate state transitions or DB writes.
 */

import { FundingService } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Webhook idempotency', () => {
  let db: ReturnType<typeof createMockPrisma>;
  let bank: MockBankAdapter;
  let hedera: ReturnType<typeof createMockHederaClient>;
  let service: FundingService;
  let approvalId: string;

  beforeEach(async () => {
    db      = createMockPrisma();
    bank    = new MockBankAdapter();
    hedera  = createMockHederaClient();
    service = new FundingService(db as never, bank, hedera);
    bank.setWebhookHandler(event => service.handleWebhookEvent(event));
    approvalId = await seedStandingApproval(db);
  });

  it('duplicate rfp.presented webhook does not double-update', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'idem-001',
      hederaAccountId:   '0.0.12345',
      amountCents:       20_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00);
    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00); // duplicate

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('presented');
    // update should have been called for the first but the second should skip
    const updateCalls = db.fundingRequest.update.mock.calls;
    const presentedUpdates = updateCalls.filter(
      c => (c[0] as unknown as { data: { state: string } }).data.state === 'presented',
    );
    expect(presentedUpdates).toHaveLength(1);
  });

  it('duplicate rfp.approved webhook does not double-update', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'idem-002',
      hederaAccountId:   '0.0.12345',
      amountCents:       20_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 20_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 20_00); // duplicate

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('approved');

    const approvedUpdates = db.fundingRequest.update.mock.calls.filter(
      c => (c[0] as unknown as { data: { state: string } }).data.state === 'approved',
    );
    expect(approvedUpdates).toHaveLength(1);
  });

  it('duplicate credit.received webhook does not double-credit', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'idem-003',
      hederaAccountId:   '0.0.12345',
      amountCents:       20_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 20_00);

    const creditRef = `credit-${req.providerRef}`;
    await bank.fireEvent('credit.received', creditRef, 20_00);
    await bank.fireEvent('credit.received', creditRef, 20_00); // duplicate

    expect(hedera.creditBalance).toHaveBeenCalledTimes(1);

    const final = await service.getFundingRequest(req.id);
    expect(final!.state).toBe('credited');
  });

  it('late webhook for a state already passed is silently skipped', async () => {
    // Request is in 'approved' state; a late 'rfp.presented' should be ignored
    const req = await service.createRfP({
      idempotencyKey:    'idem-004',
      hederaAccountId:   '0.0.12345',
      amountCents:       20_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 20_00);

    // Late rfp.presented (should skip, not revert to presented)
    await bank.fireEvent('rfp.presented', req.providerRef!, 20_00);

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('approved');
  });

  it('unknown providerRef in webhook is silently ignored', async () => {
    await expect(
      bank.fireEvent('rfp.approved', 'nonexistent-ref', 100_00),
    ).resolves.toBeUndefined();
  });
});
