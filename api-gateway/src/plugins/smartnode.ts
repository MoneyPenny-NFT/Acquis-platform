import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { SmartNodeGateway } from '@acquis/xrpl-service';
import type { RuleRef } from '@hsuite/smart-engines-sdk';

declare module 'fastify' {
  interface FastifyInstance {
    smartnode: SmartNodeGateway;
  }
}

function parseRuleRef(): RuleRef | undefined {
  const chain = process.env.HSUITE_RULE_CHAIN;
  const topicId = process.env.HSUITE_RULE_TOPIC_ID;
  const consensusTimestamp = process.env.HSUITE_RULE_CONSENSUS_TS;
  if (chain && topicId && consensusTimestamp) {
    return { chain: chain as RuleRef['chain'], topicId, consensusTimestamp };
  }
  return undefined;
}

export default fp(async (app: FastifyInstance) => {
  const seed = process.env.XRPL_MERCHANT_SEED;

  if (!seed) {
    app.log.warn('XRPL_MERCHANT_SEED not set — SmartNode gateway disabled');
    // Decorate with a stub so routes don't crash at startup
    app.decorate('smartnode', {
      isReady: () => false,
      validatePayment: async () => ({ isValid: true, reason: 'SmartNode disabled (no seed)', ruleRef: null as unknown as RuleRef }),
      getRuleRef: () => null,
    } as unknown as SmartNodeGateway);
    return;
  }

  const gateway = new SmartNodeGateway({
    merchantSeed: seed,
    network: (process.env.HSUITE_NETWORK ?? 'testnet') as 'testnet' | 'mainnet',
    cachedRuleRef: parseRuleRef(),
    maxPerTransactionXrp: process.env.HSUITE_MAX_PER_TX_XRP,
    dailyLimitXrp: process.env.HSUITE_DAILY_LIMIT_XRP,
  });

  app.decorate('smartnode', gateway);

  // Initialize after server starts so startup errors don't block the port bind
  app.addHook('onReady', async () => {
    try {
      await gateway.initialize();
      const ref = gateway.getRuleRef();
      app.log.info({ ruleRef: ref }, 'SmartNode gateway ready');
      if (ref && !process.env.HSUITE_RULE_TOPIC_ID) {
        app.log.info(
          `Add to .env.local to skip re-publishing on restart:\n` +
          `HSUITE_RULE_CHAIN=${ref.chain}\n` +
          `HSUITE_RULE_TOPIC_ID=${ref.topicId}\n` +
          `HSUITE_RULE_CONSENSUS_TS=${ref.consensusTimestamp}`,
        );
      }
    } catch (err) {
      app.log.error({ err }, 'SmartNode gateway failed to initialize — payments will be blocked');
    }
  });
});
