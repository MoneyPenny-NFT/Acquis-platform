import { xrpToDrops, dropsToXrp, usdCentsToXrp, xrpToUsdCents, formatXrp, DROPS_PER_XRP } from '../src/utils/currency';

describe('currency utils', () => {
  test('xrpToDrops converts whole XRP', () => {
    expect(xrpToDrops(1)).toBe('1000000');
    expect(xrpToDrops(10)).toBe('10000000');
  });

  test('xrpToDrops rounds fractional XRP', () => {
    expect(xrpToDrops(1.5)).toBe('1500000');
    expect(xrpToDrops(0.000001)).toBe('1');
  });

  test('dropsToXrp round-trips xrpToDrops', () => {
    const xrp = 2.5;
    expect(dropsToXrp(xrpToDrops(xrp))).toBe(xrp);
  });

  test('dropsToXrp accepts number input', () => {
    expect(dropsToXrp(1_000_000)).toBe(1);
  });

  test('usdCentsToXrp converts at given rate', () => {
    // $1.00 at $2.50/XRP = 0.4 XRP
    expect(usdCentsToXrp(100, 2.5)).toBeCloseTo(0.4);
    // $10.00 at $2.50/XRP = 4 XRP
    expect(usdCentsToXrp(1000, 2.5)).toBeCloseTo(4);
  });

  test('xrpToUsdCents converts at given rate', () => {
    // 1 XRP at $2.50 = 250 cents
    expect(xrpToUsdCents(1, 2.5)).toBe(250);
  });

  test('usdCentsToXrp and xrpToUsdCents round-trip', () => {
    const cents = 1250;
    const rate = 2.5;
    const xrp = usdCentsToXrp(cents, rate);
    expect(xrpToUsdCents(xrp, rate)).toBe(cents);
  });

  test('formatXrp trims trailing zeros', () => {
    expect(formatXrp(1)).toBe('1');
    expect(formatXrp(1.5)).toBe('1.5');
    expect(formatXrp(0.000001)).toBe('0.000001');
  });

  test('DROPS_PER_XRP constant is correct', () => {
    expect(DROPS_PER_XRP).toBe(1_000_000);
  });
});
