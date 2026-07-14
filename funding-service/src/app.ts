import Fastify from 'fastify';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import { registerRoutes } from './routes';
import { MockBankAdapter } from './adapters/MockBankAdapter';
import { StubHederaClient } from './clients/HederaClient';
import { HttpHederaClient } from './clients/HttpHederaClient';
import { FundingService } from './services/FundingService';
import type { BankAdapter } from './adapters/BankAdapter';

export interface AppOptions {
  /** Override the bank adapter (e.g. for tests). Defaults to MockBankAdapter. */
  bankAdapter?: BankAdapter;
}

export function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Capture raw body for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    (_req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch {
      const error = Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
      done(error as Error);
    }
  });

  app.register(cors);
  app.register(prismaPlugin);
  app.register(authPlugin);

  // Wire dependencies after prisma is ready
  app.after(() => {
    const bank    = opts.bankAdapter ?? new MockBankAdapter();
    const hedera  = process.env.HEDERA_SERVICE_URL
      ? new HttpHederaClient()
      : new StubHederaClient();
    const service = new FundingService(app.prisma, bank, hedera);

    // Register webhook handler on the mock adapter so auto-fire mode works
    if (bank instanceof MockBankAdapter) {
      bank.setWebhookHandler(event => service.handleWebhookEvent(event));
    }

    // Expose service for queue plugin
    (app as unknown as { fundingService: FundingService }).fundingService = service;

    app.register(registerRoutes(bank, service), { prefix: '/api/v1' });
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error:   error.name,
      message: error.message,
    });
  });

  return app;
}
