import { generateDestinationTag, usdCentsToXrp, xrpToDrops } from '../src/utils/currency';

describe('generateDestinationTag', () => {
  test('returns a positive integer', () => {
    const tag = generateDestinationTag();
    expect(Number.isInteger(tag)).toBe(true);
    expect(tag).toBeGreaterThan(0);
  });

  test('stays within uint32 range', () => {
    for (let i = 0; i < 100; i++) {
      const tag = generateDestinationTag();
      expect(tag).toBeGreaterThanOrEqual(1);
      expect(tag).toBeLessThanOrEqual(2 ** 32 - 1);
    }
  });

  test('generates unique tags', () => {
    const tags = new Set(Array.from({ length: 1000 }, generateDestinationTag));
    // With 1000 draws from 2^32-2 space, collision probability is negligible
    expect(tags.size).toBeGreaterThan(990);
  });
});

describe('payment math', () => {
  const RATE = 2.50; // $2.50 per XRP

  test('$10.00 order converts to correct drops', () => {
    const cents = 1000; // $10.00
    const xrp = usdCentsToXrp(cents, RATE);
    expect(xrp).toBeCloseTo(4, 5); // $10 / $2.50 = 4 XRP
    const drops = xrpToDrops(xrp);
    expect(drops).toBe('4000000');
  });

  test('minimum viable payment (1 cent)', () => {
    const xrp = usdCentsToXrp(1, RATE);
    const drops = xrpToDrops(xrp);
    // 1¢ / $2.50 = 0.004 XRP = 4000 drops
    expect(drops).toBe('4000');
  });
});
