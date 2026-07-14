// Pure-function core of the enforcement engine. NO I/O, NO async, NO
// dependencies on any chain SDK or database. Takes (rule set, transaction,
// pre-fetched context) and returns a RuleValidationResult.
//
// This function is the actual implementation of Merchant Rule Schema v1.1
// Claims 23-26 (limits + categories + fraud) and 44-49 (agent policy). It
// does NOT know or care whether it's being called by a stub adapter, the
// SmartNode adapter (future), a Hedera Hook (future), or a native smart
// contract (future). Every adapter calls this same function unchanged.

import type {
  MerchantRuleSet, ProposedTransaction, EnforcementContext,
  RuleValidationResult, FailedRule, WeekDay,
} from './types';

const WEEKDAYS: WeekDay[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

// Convert 'HH:MM' → total minutes since local midnight. Returns null if malformed.
function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Extract weekday + local minutes-since-midnight in a given IANA timezone.
// Uses Intl.DateTimeFormat, which is available in Node 18+.
function localWeekdayAndMinutes(iso: string, tz: string): { weekday: WeekDay; minutes: number } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wshort = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minStr  = parts.find(p => p.type === 'minute')?.value ?? '00';
  // en-US short weekday: Sun|Mon|Tue|Wed|Thu|Fri|Sat
  const shortToLong: Record<string, WeekDay> = {
    Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday',
    Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
  };
  const weekday = shortToLong[wshort] ?? 'monday';
  const minutes = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
  return { weekday, minutes };
}

export function validateTransaction(
  ruleSet: MerchantRuleSet,
  tx: ProposedTransaction,
  context: EnforcementContext,
): RuleValidationResult {
  const failedRules: FailedRule[] = [];
  const warnings:    string[]     = [];

  // ─── Claims 23-26: Transaction limits (per-tx, daily, monthly) ────────
  const L = ruleSet.limits;

  if (tx.amountCents > L.perTransaction.maxAmountCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perTransaction.maxAmountCents',
      reason: 'Transaction exceeds per-transaction maximum',
      actualValue: tx.amountCents, limitValue: L.perTransaction.maxAmountCents,
    });
  }
  if (tx.amountCents < L.perTransaction.minAmountCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perTransaction.minAmountCents',
      reason: 'Transaction below minimum allowed amount',
      actualValue: tx.amountCents, limitValue: L.perTransaction.minAmountCents,
    });
  }

  if (context.merchantDailySpendCents + tx.amountCents > L.daily.maxAmountCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'daily.maxAmountCents',
      reason: 'Merchant daily spend limit would be exceeded',
      actualValue: context.merchantDailySpendCents + tx.amountCents, limitValue: L.daily.maxAmountCents,
    });
  }
  if (context.merchantDailyTransactions + 1 > L.daily.maxTransactions) {
    failedRules.push({
      ruleGroup: 'limits', field: 'daily.maxTransactions',
      reason: 'Merchant daily transaction count would be exceeded',
      actualValue: context.merchantDailyTransactions + 1, limitValue: L.daily.maxTransactions,
    });
  }
  if (context.merchantMonthlySpendCents + tx.amountCents > L.monthly.maxAmountCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'monthly.maxAmountCents',
      reason: 'Merchant monthly spend limit would be exceeded',
      actualValue: context.merchantMonthlySpendCents + tx.amountCents, limitValue: L.monthly.maxAmountCents,
    });
  }
  if (context.merchantMonthlyTransactions + 1 > L.monthly.maxTransactions) {
    failedRules.push({
      ruleGroup: 'limits', field: 'monthly.maxTransactions',
      reason: 'Merchant monthly transaction count would be exceeded',
      actualValue: context.merchantMonthlyTransactions + 1, limitValue: L.monthly.maxTransactions,
    });
  }

  // ─── perCustomer sub-limits ────────────────────────────────────────────
  if (context.customerDailySpendCents + tx.amountCents > L.perCustomer.dailyMaxCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perCustomer.dailyMaxCents',
      reason: 'Customer daily spend would be exceeded',
      actualValue: context.customerDailySpendCents + tx.amountCents, limitValue: L.perCustomer.dailyMaxCents,
    });
  }
  if (context.customerWeeklySpendCents + tx.amountCents > L.perCustomer.weeklyMaxCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perCustomer.weeklyMaxCents',
      reason: 'Customer weekly spend would be exceeded',
      actualValue: context.customerWeeklySpendCents + tx.amountCents, limitValue: L.perCustomer.weeklyMaxCents,
    });
  }
  if (context.customerMonthlySpendCents + tx.amountCents > L.perCustomer.monthlyMaxCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perCustomer.monthlyMaxCents',
      reason: 'Customer monthly spend would be exceeded',
      actualValue: context.customerMonthlySpendCents + tx.amountCents, limitValue: L.perCustomer.monthlyMaxCents,
    });
  }
  if (context.customerTransactionsToday + 1 > L.perCustomer.maxTransactionsPerDay) {
    failedRules.push({
      ruleGroup: 'limits', field: 'perCustomer.maxTransactionsPerDay',
      reason: 'Customer daily transaction count would be exceeded',
      actualValue: context.customerTransactionsToday + 1, limitValue: L.perCustomer.maxTransactionsPerDay,
    });
  }

  // ─── velocity window ───────────────────────────────────────────────────
  const nowMs      = new Date(tx.timestamp).getTime();
  const windowMs   = L.velocity.windowMinutes * 60 * 1000;
  const inWindow   = context.recentTransactionsInVelocityWindow.filter(t => nowMs - new Date(t.timestamp).getTime() <= windowMs);
  const inWinAmt   = inWindow.reduce((s, t) => s + t.amountCents, 0);
  const inWinCount = inWindow.length;
  if (inWinAmt + tx.amountCents > L.velocity.maxAmountCents) {
    failedRules.push({
      ruleGroup: 'limits', field: 'velocity.maxAmountCents',
      reason: `Velocity window (${L.velocity.windowMinutes} min) spend would be exceeded`,
      actualValue: inWinAmt + tx.amountCents, limitValue: L.velocity.maxAmountCents,
    });
  }
  if (inWinCount + 1 > L.velocity.maxTransactions) {
    failedRules.push({
      ruleGroup: 'limits', field: 'velocity.maxTransactions',
      reason: `Velocity window (${L.velocity.windowMinutes} min) tx count would be exceeded`,
      actualValue: inWinCount + 1, limitValue: L.velocity.maxTransactions,
    });
  }

  // ─── Claims 23-26: Category rules ──────────────────────────────────────
  if (tx.category) {
    const { allowedCategories, blockedCategories, categoryLimits } = ruleSet.categories;
    if (blockedCategories.includes(tx.category)) {
      failedRules.push({
        ruleGroup: 'categories', field: 'blockedCategories',
        reason: `Category '${tx.category}' is blocked for this merchant`,
        actualValue: tx.category, limitValue: blockedCategories.join(',') || '(none)',
      });
    }
    if (allowedCategories.length > 0 && !allowedCategories.includes(tx.category)) {
      failedRules.push({
        ruleGroup: 'categories', field: 'allowedCategories',
        reason: `Category '${tx.category}' is not in the allowed list`,
        actualValue: tx.category, limitValue: allowedCategories.join(',') || '(none)',
      });
    }
    const cLim = categoryLimits[tx.category];
    if (cLim) {
      if (tx.amountCents > cLim.perTransactionMax) {
        failedRules.push({
          ruleGroup: 'categories', field: `categoryLimits.${tx.category}.perTransactionMax`,
          reason: `Transaction exceeds per-tx maximum for category '${tx.category}'`,
          actualValue: tx.amountCents, limitValue: cLim.perTransactionMax,
        });
      }
      // categoryLimits.dailyMaxCents would use a per-category daily counter,
      // which requires additional context. For MVP we track only per-tx.
    }
  }

  // ─── Claims 23-26: Fraud controls ──────────────────────────────────────
  const F = ruleSet.fraud;

  if (F.blockedCustomers.includes(tx.customerId)) {
    failedRules.push({
      ruleGroup: 'fraud', field: 'blockedCustomers',
      reason: 'Customer is on the merchant\'s blocklist',
      actualValue: tx.customerId, limitValue: F.blockedCustomers.length,
    });
  }

  if (F.duplicateWindow.enabled && context.lastTransactionSameAmountTimestamp) {
    const dtMs = nowMs - new Date(context.lastTransactionSameAmountTimestamp).getTime();
    if (dtMs >= 0 && dtMs <= F.duplicateWindow.windowSeconds * 1000) {
      failedRules.push({
        ruleGroup: 'fraud', field: 'duplicateWindow.windowSeconds',
        reason: `Duplicate transaction detected within ${F.duplicateWindow.windowSeconds}s window`,
        actualValue: Math.round(dtMs / 1000), limitValue: F.duplicateWindow.windowSeconds,
      });
    }
  }

  if (F.highValueThreshold.enabled && tx.amountCents >= F.highValueThreshold.amountCents) {
    if (F.highValueThreshold.requireConfirm) {
      // MVP: engine warns; downstream UX must present a confirmation step.
      warnings.push(`High-value transaction (${tx.amountCents / 100} USD) — requires customer confirmation`);
    }
  }

  if (F.operatingHours.enabled) {
    const { weekday, minutes } = localWeekdayAndMinutes(tx.timestamp, F.operatingHours.timezone);
    if (F.operatingHours.blockedDays.includes(weekday)) {
      failedRules.push({
        ruleGroup: 'fraud', field: 'operatingHours.blockedDays',
        reason: `Transaction on a blocked day: ${weekday}`,
        actualValue: weekday, limitValue: F.operatingHours.blockedDays.join(','),
      });
    } else {
      const openM  = parseHHMM(F.operatingHours.openTime);
      const closeM = parseHHMM(F.operatingHours.closeTime);
      if (openM !== null && closeM !== null) {
        const inRange = openM < closeM
          ? (minutes >= openM && minutes <= closeM)
          : (minutes >= openM || minutes <= closeM); // overnight window
        if (!inRange) {
          failedRules.push({
            ruleGroup: 'fraud', field: 'operatingHours.openTime',
            reason: `Transaction outside merchant operating hours (${F.operatingHours.openTime}-${F.operatingHours.closeTime} ${F.operatingHours.timezone})`,
            actualValue: `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,
            limitValue:  `${F.operatingHours.openTime}-${F.operatingHours.closeTime}`,
          });
        }
      }
    }
  }

  // ─── Claims 44-49: Agent policy (only when tx.isAgentInitiated) ────────
  if (tx.isAgentInitiated) {
    const ap = ruleSet.agentPolicy;
    if (!ap?.enabled) {
      failedRules.push({
        ruleGroup: 'agentPolicy', field: 'enabled',
        reason: 'Agent-initiated transactions are not enabled for this merchant',
        actualValue: 'true', limitValue: 'false',
      });
    } else {
      // expiresAt in the past → whole policy expired
      if (new Date(ap.bounds.expiresAt).getTime() < nowMs) {
        failedRules.push({
          ruleGroup: 'agentPolicy', field: 'bounds.expiresAt',
          reason: 'Agent policy has expired',
          actualValue: tx.timestamp, limitValue: ap.bounds.expiresAt,
        });
      }
      if (tx.amountCents > ap.bounds.maxPerTransactionCents) {
        failedRules.push({
          ruleGroup: 'agentPolicy', field: 'bounds.maxPerTransactionCents',
          reason: 'Agent transaction exceeds per-tx maximum',
          actualValue: tx.amountCents, limitValue: ap.bounds.maxPerTransactionCents,
        });
      }
      if (ap.bounds.allowedMerchantIds.length > 0 && !ap.bounds.allowedMerchantIds.includes(tx.merchantId)) {
        failedRules.push({
          ruleGroup: 'agentPolicy', field: 'bounds.allowedMerchantIds',
          reason: `Merchant '${tx.merchantId}' is not in the agent's allowed list`,
          actualValue: tx.merchantId, limitValue: ap.bounds.allowedMerchantIds.join(','),
        });
      }
      if (tx.category && ap.bounds.allowedCategories.length > 0 && !ap.bounds.allowedCategories.includes(tx.category)) {
        failedRules.push({
          ruleGroup: 'agentPolicy', field: 'bounds.allowedCategories',
          reason: `Category '${tx.category}' is not in the agent's allowed list`,
          actualValue: tx.category, limitValue: ap.bounds.allowedCategories.join(','),
        });
      }
      if (ap.x402.enabled && tx.x402PaymentAge !== undefined) {
        if (tx.x402PaymentAge > ap.x402.maxPaymentAgeCents) {
          failedRules.push({
            ruleGroup: 'agentPolicy', field: 'x402.maxPaymentAgeCents',
            reason: 'x402 payment is older than the merchant\'s allowed maximum',
            actualValue: tx.x402PaymentAge, limitValue: ap.x402.maxPaymentAgeCents,
          });
        }
      }
    }
  }

  // Silence-unused warning for weekday helper on the "days" branch
  void WEEKDAYS;

  return {
    approved:       failedRules.length === 0,
    merchantId:     ruleSet.merchantId,
    ruleSetVersion: ruleSet.version,
    hcsTopicId:     ruleSet.hcsTopicId,
    evaluatedAt:    new Date().toISOString(),
    failedRules,
    warnings,
    // onChainProof populated by the CALLER after HCS write
  };
}
