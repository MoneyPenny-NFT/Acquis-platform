export interface RewardCalculationParams {
  amountCents: number;
  rateBps: number;
}

export interface RewardCalculationResult {
  rewardUnits: number;
  rewardDisplay: string;
  isZero: boolean;
}

// AQT has 2 decimal places; integer amounts are hundredths of AQT.
// Formula: floor(amountCents * rateBps / 10000)
// Floor (not round) guarantees we never issue more than the configured rate.
export function calculateReward(params: RewardCalculationParams): RewardCalculationResult {
  const { amountCents, rateBps } = params;

  if (amountCents < 0 || rateBps < 0) {
    throw new Error('calculateReward: amountCents and rateBps must be non-negative');
  }

  const rewardUnits = Math.floor((amountCents * rateBps) / 10000);

  return {
    rewardUnits,
    rewardDisplay: (rewardUnits / 100).toFixed(2) + ' AQT',
    isZero: rewardUnits === 0,
  };
}
