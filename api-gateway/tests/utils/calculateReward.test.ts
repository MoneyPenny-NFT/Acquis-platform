import { calculateReward } from '../../src/utils/calculateReward';

describe('calculateReward', () => {
  it('$50.00 at 100 bps (1%) → 50 units (0.50 AQT)', () => {
    const result = calculateReward({ amountCents: 5000, rateBps: 100 });
    expect(result.rewardUnits).toBe(50);
    expect(result.rewardDisplay).toBe('0.50 AQT');
    expect(result.isZero).toBe(false);
  });

  it('$0.55 at 100 bps → 0 units, isZero: true', () => {
    const result = calculateReward({ amountCents: 55, rateBps: 100 });
    expect(result.rewardUnits).toBe(0);
    expect(result.rewardDisplay).toBe('0.00 AQT');
    expect(result.isZero).toBe(true);
  });

  it('$0.99 at 100 bps → 0 units, isZero: true (99 * 100 / 10000 = 0.99 → floor → 0)', () => {
    const result = calculateReward({ amountCents: 99, rateBps: 100 });
    expect(result.rewardUnits).toBe(0);
    expect(result.isZero).toBe(true);
  });

  it('$1.00 at 100 bps → 1 unit (0.01 AQT) (100 * 100 / 10000 = 1.00 → floor → 1)', () => {
    const result = calculateReward({ amountCents: 100, rateBps: 100 });
    expect(result.rewardUnits).toBe(1);
    expect(result.rewardDisplay).toBe('0.01 AQT');
    expect(result.isZero).toBe(false);
  });

  it('$1000.00 at 250 bps (2.5%) → 2500 units (25.00 AQT)', () => {
    const result = calculateReward({ amountCents: 100000, rateBps: 250 });
    expect(result.rewardUnits).toBe(2500);
    expect(result.rewardDisplay).toBe('25.00 AQT');
    expect(result.isZero).toBe(false);
  });

  it('throws on negative amountCents', () => {
    expect(() => calculateReward({ amountCents: -1, rateBps: 100 }))
      .toThrow('calculateReward: amountCents and rateBps must be non-negative');
  });

  it('throws on negative rateBps', () => {
    expect(() => calculateReward({ amountCents: 5000, rateBps: -1 }))
      .toThrow('calculateReward: amountCents and rateBps must be non-negative');
  });

  it('zero amountCents → zero reward, isZero: true, no throw', () => {
    const result = calculateReward({ amountCents: 0, rateBps: 100 });
    expect(result.rewardUnits).toBe(0);
    expect(result.isZero).toBe(true);
  });
});
