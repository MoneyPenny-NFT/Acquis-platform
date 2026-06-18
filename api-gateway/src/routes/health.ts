import type { FastifyInstance } from 'fastify';
import { getClient } from '@acquis/hedera-service';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      network: process.env.HEDERA_NETWORK ?? 'testnet',
      db: app.dbReady ? 'connected' : 'unavailable',
    };

    try {
      getClient(); // throws if env vars missing
      health.hedera = 'configured';
    } catch {
      health.hedera = 'misconfigured';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });
}
