import Fastify from 'fastify';
import cors from '@fastify/cors';
import { onboardingRoutes } from './routes/onboarding';

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.register(cors);
  app.register(onboardingRoutes, { prefix: '/api/v1' });

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
