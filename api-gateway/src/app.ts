import Fastify from 'fastify';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import rateLimitPlugin from './plugins/rateLimit';
import smartnodePlugin from './plugins/smartnode';
import { registerRoutes } from './routes';

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Override JSON parser to capture raw body — required for Stripe webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (_req, body, done) {
    (_req as any).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      const error = new Error('Invalid JSON') as Error & { statusCode: number };
      error.statusCode = 400;
      done(error);
    }
  });

  app.register(cors);
  app.register(rateLimitPlugin);
  app.register(prismaPlugin);
  app.register(authPlugin);
  app.register(smartnodePlugin);
  app.register(registerRoutes, { prefix: '/api/v1' });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: error.message,
    });
  });

  return app;
}
