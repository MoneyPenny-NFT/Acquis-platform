import type { FastifyInstance } from 'fastify';
import type { BankAdapter } from '../adapters/BankAdapter';
import type { FundingService } from '../services/FundingService';
import { healthRoutes } from './health';
import { rfpRoutes } from './rfp';
import { standingApprovalRoutes } from './standingApproval';
import { achRoutes } from './ach';
import { webhookRoutes } from './webhook';

export function registerRoutes(bank: BankAdapter, service: FundingService) {
  return async (app: FastifyInstance) => {
    app.register(healthRoutes);
    app.register(rfpRoutes(service));
    app.register(standingApprovalRoutes(service));
    app.register(achRoutes(service));
    app.register(webhookRoutes(bank, service));
  };
}
