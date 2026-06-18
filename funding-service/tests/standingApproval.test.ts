/**
 * Standing-approval limit enforcement tests.
 * No RfP may be created outside an active approval's limits.
 */

import { FundingService, FundingValidationError } from '../src/services/FundingService';
import { MockBankAdapter } from '../src/adapters/MockBankAdapter';
import { createMockPrisma } from './helpers/mockPrisma';
import { createMockHederaClient } from './helpers/mockHedera';
import { seedStandingApproval } from './helpers/fixtures';

describe('Standing-approval limit enforcement', () => {
  let db: ReturnType<typeof createMockPrisma>;
  let bank: MockBankAdapter;
  let service: FundingService;

  beforeEach(() => {
    db      = createMockPrisma();
    bank    = new MockBankAdapter();
    service = new FundingService(db as never, bank, createMockHederaClient());
  });

  it('rejects when no standing approval exists', async () => {
    await expect(
      service.createRfP({
        idempotencyKey:    'sa-001',
        hederaAccountId:   '0.0.12345',
        amountCents:       10_00,
        standingApprovalId: 'nonexistent-id',
      }),
    ).rejects.toThrow(FundingValidationError);
  });

  it('rejects when approval is revoked', async () => {
    const id = await seedStandingApproval(db, { status: 'revoked' });

    await expect(
      service.createRfP({
        idempotencyKey:    'sa-002',
        hederaAccountId:   '0.0.12345',
        amountCents:       10_00,
        standingApprovalId: id,
      }),
    ).rejects.toThrow('revoked');
  });

  it('rejects when approval has expired', async () => {
    const id = await seedStandingApproval(db, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.createRfP({
        idempotencyKey:    'sa-003',
        hederaAccountId:   '0.0.12345',
        amountCents:       10_00,
        standingApprovalId: id,
      }),
    ).rejects.toThrow('expired');
  });

  it('rejects when amount exceeds perTxLimit', async () => {
    const id = await seedStandingApproval(db, { perTxLimitCents: 50_00 });

    await expect(
      service.createRfP({
        idempotencyKey:    'sa-004',
        hederaAccountId:   '0.0.12345',
        amountCents:       51_00,  // $51 > $50 limit
        standingApprovalId: id,
      }),
    ).rejects.toThrow('per-transaction limit');
  });

  it('rejects when cumulative amount would exceed period limit', async () => {
    // Period limit = $100, two requests of $60 each = $120 > $100
    const id = await seedStandingApproval(db, {
      perTxLimitCents:  60_00,
      periodLimitCents: 100_00,
    });

    // First request succeeds ($60)
    await service.createRfP({
      idempotencyKey:    'sa-005a',
      hederaAccountId:   '0.0.12345',
      amountCents:       60_00,
      standingApprovalId: id,
    });

    // Second request would push total to $120 — exceeds $100 period limit
    await expect(
      service.createRfP({
        idempotencyKey:    'sa-005b',
        hederaAccountId:   '0.0.12345',
        amountCents:       60_00,
        standingApprovalId: id,
      }),
    ).rejects.toThrow('period limit');
  });

  it('period limit excludes declined and expired requests', async () => {
    const id = await seedStandingApproval(db, {
      perTxLimitCents:  60_00,
      periodLimitCents: 100_00,
    });
    bank.setWebhookHandler(event => service.handleWebhookEvent(event));

    // First request declined — should not count toward period limit
    const r1 = await service.createRfP({
      idempotencyKey:    'sa-006a',
      hederaAccountId:   '0.0.12345',
      amountCents:       60_00,
      standingApprovalId: id,
    });
    await bank.fireEvent('rfp.declined', r1.providerRef!, 60_00);

    // Second request of $60 should still be allowed (first doesn't count)
    await expect(
      service.createRfP({
        idempotencyKey:    'sa-006b',
        hederaAccountId:   '0.0.12345',
        amountCents:       60_00,
        standingApprovalId: id,
      }),
    ).resolves.toBeTruthy();
  });

  it('allows exact perTxLimit amount', async () => {
    const id = await seedStandingApproval(db, { perTxLimitCents: 100_00 });

    await expect(
      service.createRfP({
        idempotencyKey:    'sa-007',
        hederaAccountId:   '0.0.12345',
        amountCents:       100_00,
        standingApprovalId: id,
      }),
    ).resolves.toBeTruthy();
  });
});
