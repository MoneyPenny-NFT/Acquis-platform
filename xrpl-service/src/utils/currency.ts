export const DROPS_PER_XRP = 1_000_000;

export function xrpToDrops(xrp: number): string {
  return String(Math.round(xrp * DROPS_PER_XRP));
}

export function dropsToXrp(drops: string | number): number {
  return Number(drops) / DROPS_PER_XRP;
}

export function usdCentsToXrp(usdCents: number, xrpUsdRate: number): number {
  // usdCents / 100 = USD; USD / rate = XRP
  return usdCents / 100 / xrpUsdRate;
}

export function xrpToUsdCents(xrp: number, xrpUsdRate: number): number {
  return Math.round(xrp * xrpUsdRate * 100);
}

export function formatXrp(xrp: number): string {
  return xrp.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

// Uint32 range 1..2^32-1 (0 is reserved/untagged on XRPL)
export function generateDestinationTag(): number {
  return Math.floor(Math.random() * (2 ** 32 - 2)) + 1;
}
