import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '.prisma/credential-client';
import { EnrollmentService } from './services/enrollment.service';
import { credentialRoutes } from './routes/credentials';

export function buildApp() {
  const app    = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const prisma = new PrismaClient();
  const service = new EnrollmentService(prisma);

  app.register(cors);
  app.register(credentialRoutes(service), { prefix: '/api/v1' });

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
