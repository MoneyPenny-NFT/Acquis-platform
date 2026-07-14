// Stub adapter — wires the pure-function enforcement engine into the
// api-gateway payment flow WITHOUT depending on SmartNode, Hedera Hooks,
// or any specific external validator. When one of those becomes available,
// a new adapter replaces this file's internals and calls the SAME
// validateTransaction() function. The engine, the rule schema, and every
// caller of runEnforcementCheck() remain unchanged across that swap.
//
// This adapter's responsibilities:
//   1. Look up the current MerchantRuleSet version for the merchant
//   2. Gather context from EnforcementLog (recent spend/velocity/duplicate)
//   3. Call validateTransaction() with the assembled context
//   4. Write a HCS record for the evaluation (approved AND rejected — both
//      are audit-relevant per Merchant Rule Schema principle #1)
//   5. Write an EnforcementLog row (the DB companion to HCS — fast-queried
//      by future validations for context assembly)
//   6. Return the RuleValidationResult with onChainProof populated

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { HCSService } from '@acquis/hedera-service';
import {
  validateTransaction,
  type MerchantRuleSet,
  type ProposedTransaction,
  type EnforcementContext,
  type RuleValidationResult,
} from '@acquis/enforcement-engine';

const HCS_TOPIC = process.env.ACQUIS_HCS_TOPIC ?? '0.0.9342744';

const DAY_MS   = 24 * 60 * 60 * 1000;
const WEEK_MS  = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export interface RunEnforcementCheckDeps {
  prisma: PrismaClient;
  log:    FastifyBaseLogger;
}

export async function runEnforcementCheck(
  deps: RunEnforcementCheckDeps,
  tx:   ProposedTransaction,
): Promise<RuleValidationResult | { error: 'no_rule_set'; merchantId: string }> {
  const { prisma, log } = deps;

  // 1. Fetch current rule set version (highest version for the merchant).
  const ruleSetRow = await prisma.merchantRuleSet.findFirst({
    where:   { merchantId: tx.merchantId },
    orderBy: { version: 'desc' },
  });
  if (!ruleSetRow) {
    log.warn({ merchantId: tx.merchantId }, 'runEnforcementCheck: no MerchantRuleSet — cannot enforce');
    return { error: 'no_rule_set', merchantId: tx.merchantId };
  }
  const ruleSet: MerchantRuleSet = JSON.parse(ruleSetRow.ruleSetJson);

  // 2. Gather context from EnforcementLog. Only APPROVED prior transactions
  // count toward spend totals — rejected attempts don't consume the budget.
  const nowMs        = new Date(tx.timestamp).getTime();
  const dayStart     = new Date(nowMs - DAY_MS);
  const weekStart    = new Date(nowMs - WEEK_MS);
  const monthStart   = new Date(nowMs - MONTH_MS);
  const velocityMs   = ruleSet.limits.velocity.windowMinutes * 60 * 1000;
  const velocityStart = new Date(nowMs - velocityMs);

  const [
    customerDaily, customerWeekly, customerMonthly, customerTxToday,
    merchantDaily, merchantMonthly,
    velocityRecent, dupCandidates,
  ] = await Promise.all([
    prisma.enforcementLog.findMany({
      where: { customerId: tx.customerId, approved: true, createdAt: { gte: dayStart } },
      select: { amountCents: true },
    }),
    prisma.enforcementLog.findMany({
      where: { customerId: tx.customerId, approved: true, createdAt: { gte: weekStart } },
      select: { amountCents: true },
    }),
    prisma.enforcementLog.findMany({
      where: { customerId: tx.customerId, approved: true, createdAt: { gte: monthStart } },
      select: { amountCents: true },
    }),
    prisma.enforcementLog.count({
      where: { customerId: tx.customerId, approved: true, createdAt: { gte: dayStart } },
    }),
    prisma.enforcementLog.findMany({
      where: { merchantId: tx.merchantId, approved: true, createdAt: { gte: dayStart } },
      select: { amountCents: true },
    }),
    prisma.enforcementLog.findMany({
      where: { merchantId: tx.merchantId, approved: true, createdAt: { gte: monthStart } },
      select: { amountCents: true },
    }),
    prisma.enforcementLog.findMany({
      where: { merchantId: tx.merchantId, approved: true, createdAt: { gte: velocityStart } },
      select: { amountCents: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    // Duplicate check: same (customer, merchant, amount) within the widest
    // duplicate window we'd care about (60s ceiling covers all sensible configs).
    prisma.enforcementLog.findMany({
      where: {
        customerId: tx.customerId, merchantId: tx.merchantId,
        amountCents: tx.amountCents, approved: true,
        createdAt: { gte: new Date(nowMs - 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    }),
  ]);

  const sumCents = (rows: { amountCents: number }[]) => rows.reduce((s, r) => s + r.amountCents, 0);

  const context: EnforcementContext = {
    customerDailySpendCents:   sumCents(customerDaily),
    customerWeeklySpendCents:  sumCents(customerWeekly),
    customerMonthlySpendCents: sumCents(customerMonthly),
    customerTransactionsToday: customerTxToday,
    merchantDailySpendCents:   sumCents(merchantDaily),
    merchantDailyTransactions: merchantDaily.length,
    merchantMonthlySpendCents: sumCents(merchantMonthly),
    merchantMonthlyTransactions: merchantMonthly.length,
    recentTransactionsInVelocityWindow: velocityRecent.map(r => ({
      amountCents: r.amountCents,
      timestamp:   r.createdAt.toISOString(),
    })),
    lastTransactionSameAmountTimestamp: dupCandidates[0]?.createdAt.toISOString(),
  };

  // 3. Call the pure function.
  const result = validateTransaction(ruleSet, tx, context);

  // 4. Write to HCS. Both approved and rejected — audit trail includes both.
  let hcsSeq: number | null = null;
  try {
    const hcsResult = await HCSService.submitMessage({
      topic_id: HCS_TOPIC,
      message: JSON.stringify({
        type:            'enforcement.evaluation',
        merchantId:      tx.merchantId,
        customerId:      tx.customerId,
        amountCents:     tx.amountCents,
        category:        tx.category ?? null,
        ruleSetVersion:  ruleSet.version,
        approved:        result.approved,
        failedRules:     result.failedRules,
        evaluatedAt:     result.evaluatedAt,
        adapter:         'stub',
      }),
    });
    hcsSeq = hcsResult.sequence_number;
    result.onChainProof = {
      hcsSequenceNumber:     hcsResult.sequence_number,
      hcsConsensusTimestamp: hcsResult.consensus_timestamp,
    };
  } catch (err) {
    log.error({ err }, 'runEnforcementCheck: HCS write failed — evaluation still returned');
  }

  // 5. Persist EnforcementLog row for future context queries.
  try {
    await prisma.enforcementLog.create({
      data: {
        merchantId:        tx.merchantId,
        customerId:        tx.customerId,
        amountCents:       tx.amountCents,
        category:          tx.category ?? null,
        approved:          result.approved,
        ruleSetVersion:    ruleSet.version,
        failedRulesJson:   result.failedRules.length ? JSON.stringify(result.failedRules) : null,
        hcsSequenceNumber: hcsSeq,
        hcsTopicId:        hcsSeq ? HCS_TOPIC : null,
      },
    });
  } catch (err) {
    log.error({ err }, 'runEnforcementCheck: EnforcementLog write failed');
  }

  return result;
}
