import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Webhook endpoint must be exempt — its authenticity is verified by signature
const EXEMPT = new Set(['/api/v1/health', '/api/v1/webhook']);

async function authPlugin(app: FastifyInstance) {
  const raw = process.env.API_KEYS ?? '';
  const validKeys = new Set(raw.split(',').map(k => k.trim()).filter(Boolean));

  if (validKeys.size === 0) {
    app.log.warn('API_KEYS not set — all non-exempt requests will be rejected');
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (EXEMPT.has(request.url)) return;

    const key = request.headers['x-api-key'];
    if (typeof key !== 'string' || !validKeys.has(key)) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or invalid x-api-key header',
      });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
