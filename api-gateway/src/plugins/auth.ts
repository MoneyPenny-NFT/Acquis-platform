import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Routes exempt from x-api-key enforcement.
// Square webhook paths are exempt because Square uses its own HMAC-SHA256
// signature (verified inside the route handler) — it cannot send x-api-key.
const EXEMPT_EXACT = new Set(['/api/v1/health', '/api/v1/fund/webhook']);
// Exempt prefixes — route handlers own their own authentication:
//   - /auth/      dashboard session auth (email/password bearer token)
//   - /webhooks/square/  Square HMAC signature
//   - /webhooks/pos/     per-merchant webhook secret
const EXEMPT_PREFIX = [
  '/api/v1/auth/',
  '/api/v1/webhooks/square/',
  '/api/v1/webhooks/pos/',
];

async function authPlugin(app: FastifyInstance) {
  const raw = process.env.API_KEYS ?? '';
  const validKeys = new Set(
    raw.split(',').map(k => k.trim()).filter(Boolean),
  );

  if (validKeys.size === 0) {
    app.log.warn('API_KEYS is not set — all requests will be rejected');
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];
    if (EXEMPT_EXACT.has(url)) return;
    if (EXEMPT_PREFIX.some(p => url.startsWith(p))) return;

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
