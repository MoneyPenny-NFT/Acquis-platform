/**
 * Decline-path test.
 * RfP flows: created → validated → sent → presented → declined (terminal)
 */

import { FundingService } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { StateMachineError } from '../src/state/RfpStateMachine';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Decline-path RfP lifecycle', () => {
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

  it('transitions to declined on rfp.declined webhook', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'decline-001',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 50_00);
    await bank.fireEvent('rfp.declined', req.providerRef!, 50_00, { reason: 'Insufficient funds' });

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('declined');
    expect(updated!.declinedAt).toBeTruthy();
    expect(updated!.declineReason).toBe('Insufficient funds');
  });

  it('does not credit Hedera on decline', async () => {
    const hedera = createMockHederaClient();
    service = new FundingService(db as never, bank, hedera);
    bank.setWebhookHandler(event => service.handleWebhookEvent(event));

    const req = await service.createRfP({
      idempotencyKey:    'decline-002',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 50_00);
    await bank.fireEvent('rfp.declined', req.providerRef!, 50_00);

    expect(hedera.creditBalance).not.toHaveBeenCalled();
  });

  it('declined is a terminal state — further transitions throw', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'decline-003',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    await bank.fireEvent('rfp.presented', req.providerRef!, 50_00);
    await bank.fireEvent('rfp.declined', req.providerRef!, 50_00);

    // Trying to approve after decline is invalid
    await expect(
      bank.fireEvent('rfp.approved', req.providerRef!, 50_00),
    ).rejects.toThrow(StateMachineError);
  });

  it('late rfp.presented after decline is silently skipped (idempotent)', async () => {
    const req = await service.createRfP({
      idempotencyKey:    'decline-004',
      hederaAccountId:   '0.0.12345',
      amountCents:       50_00,
      standingApprovalId: approvalId,
    });

    // Decline without presented first (bank may not fire presented in all cases)
    await bank.fireEvent('rfp.declined', req.providerRef!, 50_00);
    // Now a late rfp.presented arrives — should skip, not throw
    await expect(
      bank.fireEvent('rfp.presented', req.providerRef!, 50_00),
    ).resolves.toBeUndefined();

    const updated = await service.getFundingRequest(req.id);
    expect(updated!.state).toBe('declined');
  });
});
