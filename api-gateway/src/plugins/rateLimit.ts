import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: process.env.NODE_ENV === 'test' ? 10_000 : 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req: FastifyRequest, context: { ttl: number }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
