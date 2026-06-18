import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    db:     app.dbReady,
    ts:     new Date().toISOString(),
  }));
}
