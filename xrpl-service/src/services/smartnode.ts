import { BaasClient, forAccount } from '@hsuite/smart-engines-sdk';
import type { ValidationResult, RuleRef } from '@hsuite/smart-engines-sdk';
import { Wallet } from 'xrpl';
import { sign as xrplSign } from 'ripple-keypairs';
import { dropsToXrp, usdCentsToXrp } from '../utils/currency';

export interface SmartNodeConfig {
  merchantSeed: string;
  network: 'testnet' | 'mainnet';
  // Cached from a previous publish — skips re-publishing on restart
  cachedRuleRef?: RuleRef;
  // Payment policy (XRP amounts as strings)
  maxPerTransactionXrp?: string;
  dailyLimitXrp?: string;
}

export interface PaymentValidation {
  isValid: boolean;
  reason?: string;
  ruleRef: RuleRef;
}

export class SmartNodeGateway {
  private baas: BaasClient | null = null;
  private ruleRef: RuleRef | null = null;
  private readonly config: SmartNodeConfig;

  constructor(config: SmartNodeConfig) {
    this.config = config;
    if (config.cachedRuleRef) {
      this.ruleRef = config.cachedRuleRef;
    }
  }

  async initialize(): Promise<void> {
    const wallet = Wallet.fromSeed(this.config.merchantSeed);

    this.baas = await BaasClient.connectToCluster({
      network: this.config.network,
    });

    await this.baas.authenticate({
      chain: 'xrpl',
      walletAddress: wallet.address,
      publicKey: wallet.publicKey,
      signFn: (message: string) => {
        const hex = Buffer.from(message, 'utf-8').toString('hex').toUpperCase();
        return xrplSign(hex, wallet.privateKey);
      },
    });

    if (!this.ruleRef) {
      this.ruleRef = await this.publishPaymentRuleset();
    }
  }

  private async publishPaymentRuleset(): Promise<RuleRef> {
    if (!this.baas) throw new Error('Not initialized');

    const rule = forAccount()
      .withOperations({
        transfer: {
          enabled: true,
          limits: {
            maxPerTransaction: this.config.maxPerTransactionXrp ?? '100',
            dailyLimit: this.config.dailyLimitXrp ?? '1000',
          },
        },
      })
      .build();

    const { ruleRef } = await this.baas.rules.publish(rule);
    return ruleRef;
  }

  async validatePayment(params: {
    amountCents: number;
    xrpUsdRate: number;
    toAddress: string;
    destinationTag: number;
  }): Promise<PaymentValidation> {
    if (!this.baas || !this.ruleRef) {
      throw new Error('SmartNodeGateway not initialized — call initialize() first');
    }

    const xrpAmount = usdCentsToXrp(params.amountCents, params.xrpUsdRate);

    const result: ValidationResult = await this.baas.rules.simulate({
      ruleRef: this.ruleRef,
      action: 'transfer',
      context: {
        amount: String(xrpAmount),
        toAddress: params.toAddress,
        destinationTag: params.destinationTag,
      },
    });

    return {
      isValid: result.isValid,
      reason: result.reason,
      ruleRef: this.ruleRef,
    };
  }

  getRuleRef(): RuleRef | null {
    return this.ruleRef;
  }

  isReady(): boolean {
    return this.baas !== null && this.ruleRef !== null;
  }
}
