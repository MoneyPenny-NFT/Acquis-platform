/**
 * Expiry-path test.
 * Two routes to expiry:
 *   1. Bank sends rfp.expired webhook
 *   2. Reconciliation job runs expireStaleRfPs() on overdue requests
 */

import { FundingService } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Expiry-path RfP lifecycle', () => {
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

  it('transitions to expired on rfp.expired webhook', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'expire-001',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 50_00);
    await bank.fireEvent('rfp.expired', req.providerRef!, 50_00);

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('expired');
    expect(updated!.expiredAt).toBeTruthy();
  });

  it('expireStaleRfPs() expires sent requests past their deadline', async () => {
    const pastDeadline = new Date(Date.now() - 1000); // 1 second ago
    const req = await service.createRfP({
      idempotencyKey:    'expire-002',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
      expiresAt:         pastDeadline,
    });

    // Request is in 'sent' state and expiresAt is in the past
    expect(req.state).toBe('sent');

    const count = await service.expireStaleRfPs();
    expect(count).toBe(1);

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('expired');
  });

  it('expireStaleRfPs() expires presented requests past their deadline', async () => {
    const pastDeadline = new Date(Date.now() - 1000);
    const req = await service.createRfP({
      idempotencyKey:    'expire-003',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
      expiresAt:         pastDeadline,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 50_00);

    const count = await service.expireStaleRfPs();
    expect(count).toBe(1);

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('expired');
  });

  it('expireStaleRfPs() does not expire non-overdue requests', async () => {
    await service.createRfP({
      idempotencyKey:    'expire-004',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
      expiresAt:         new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    });

    const count = await service.expireStaleRfPs();
    expect(count).toBe(0);
  });

  it('does not credit Hedera on expiry', async () => {
    const hedera = createMockHederaClient();
    service = new FundingService(db as never, bank, hedera);
    bank.setWebhookHandler(event => service.handleWebhookEvent(event));

    const req = await service.createRfP({
      idempotencyKey:    'expire-005',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.expired', req.providerRef!, 50_00);
    expect(hedera.creditBalance).not.toHaveBeenCalled();
  });
});
