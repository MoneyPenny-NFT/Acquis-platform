import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BankAdapter } from '../adapters/BankAdapter';
import type { FundingService } from '../services/FundingService';

export function webhookRoutes(bank: BankAdapter, service: FundingService) {
  return async (app: FastifyInstance) => {
    // Raw body required for signature verification — registered in app.ts
    app.post('/webhook', async (request: FastifyRequest, reply) => {
      const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
      const headers = request.headers as Record<string, string>;

      if (!bank.verifyWebhookSignature(rawBody, headers)) {
        return reply.status(401).send({ message: 'Invalid webhook signature' });
      }

      let event;
      try {
        event = bank.parseWebhookEvent(rawBody);
      } catch {
        return reply.status(400).send({ message: 'Malformed webhook payload' });
      }

      await service.handleWebhookEvent(event);
      return reply.status(200).send({ received: true });
    });
  };
}
