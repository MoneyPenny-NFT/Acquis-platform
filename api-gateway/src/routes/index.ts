import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { accountRoutes } from './accounts';
import { tokenRoutes } from './tokens';
import { transferRoutes } from './transfers';
import { payRoutes } from './pay';
import { bankLinkRoutes } from './bankLink';
import { fundRoutes } from './fund';
import { xrplRoutes } from './xrpl';

export async function registerRoutes(app: FastifyInstance) {
  app.register(healthRoutes);
  app.register(accountRoutes);
  app.register(tokenRoutes);
  app.register(transferRoutes);
  app.register(payRoutes);
  app.register(bankLinkRoutes);
  app.register(fundRoutes);
  app.register(xrplRoutes);
}
