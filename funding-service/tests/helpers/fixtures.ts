import type { MockPrisma } from './mockPrisma';

/** Seed a valid active StandingApproval and return its id. */
export async function seedStandingApproval(
  db: MockPrisma,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const record = await db.standingApproval.create({
    data: {
      hederaAccountId:  '0.0.12345',
      mandateRef:       'MANDATE-001',
      perTxLimitCents:  100_00,   // $100
      periodLimitCents: 1000_00,  // $1000 per period
      periodDays:       30,
      expiresAt:        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status:           'active',
      ...overrides,
    },
  });
  return (record as { id: string }).id;
}
