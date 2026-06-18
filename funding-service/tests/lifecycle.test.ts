/**
 * Happy-path lifecycle test.
 * RfP flows through: created → validated → sent → presented → approved
 *   → settled → matched → credited
 */

import { FundingService } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Happy-path RfP lifecycle', () => {
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

  it('creates a FundingRequest and transitions to sent', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'key-001',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    expect(req.state).toBe('sent');
    expect(req.providerRef).toBeTruthy();
    expect(req.hcsRequestMsgId).toBeTruthy();
    expect(hedera.validateInvoice).toHaveBeenCalledTimes(1);
    expect(hedera.writeHcs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rfp.sent' }),
    );
  });

  it('transitions through the full lifecycle on webhook events', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'key-002',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    const ref = req.providerRef!;

    // presented
    await bank.fireEvent('rfp.presented', ref, 50_00);
    let updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('presented');
    expect(updated!.presentedAt).toBeTruthy();

    // approved
    await bank.fireEvent('rfp.approved', ref, 50_00);
    updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('approved');
    expect(updated!.approvedAt).toBeTruthy();

    // credit arrives
    await bank.fireEvent('credit.received', `credit-${ref}`, 50_00);
    updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('credited');
    expect(updated!.settledAt).toBeTruthy();
    expect(updated!.creditedAt).toBeTruthy();
  });

  it('credits the Hedera balance on settlement', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'key-003',
      hederaAccountId:   '0.0.12345',
      amountCents:       75_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 75_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 75_00);
    await bank.fireEvent('credit.received', `credit-${req.providerRef}`, 75_00);

    expect(hedera.creditBalance).toHaveBeenCalledWith({
      hederaAccountId:  '0.0.12345',
      amountCents:      75_00,
      fundingRequestId: req.id,
    });
  });

  it('writes HCS credit.matched record on settlement', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'key-004',
      hederaAccountId:   '0.0.12345',
      amountCents:       25_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 25_00);
    await bank.fireEvent('rfp.approved', req.providerRef!, 25_00);
    await bank.fireEvent('credit.received', `credit-${req.providerRef}`, 25_00);

    expect(hedera.writeHcs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'credit.matched' }),
    );
    const final = await service.getFundingRequest(req.id);
    expect(final!.hcsCreditMsgId).toBeTruthy();
  });

  it('returns existing request for duplicate idempotency key', async () => {
    const first = await service.createRfP({
      idempotencyKey:    'key-idem',
      hederaAccountId:   '0.0.12345',
      amountCents:       10_00,
      standingApprovalId: approvalId,
    });

    // Second call with same key — no new DB write
    const second = await service.createRfP({
      idempotencyKey:    'key-idem',
      hederaAccountId:   '0.0.12345',
      amountCents:       10_00,
      standingApprovalId: approvalId,
    });

    expect(second.id).toBe(first.id);
    // bank.sendRfP should only have been called once
    expect(db.fundingRequest.create).toHaveBeenCalledTimes(1);
  });
});
