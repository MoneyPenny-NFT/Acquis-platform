import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    dbReady: boolean;
  }
}

async function prismaPlugin(app: FastifyInstance) {
  const prisma = new PrismaClient();
  let dbReady = false;
  try {
    await prisma.$connect();
    dbReady = true;
    app.log.info('Database connected');
  } catch (err) {
    app.log.warn({ err }, 'Database unavailable — transaction logging disabled');
  }
  app.decorate('prisma', prisma);
  app.decorate('dbReady', dbReady);
  app.addHook('onClose', async () => { await prisma.$disconnect(); });
}

export default fp(prismaPlugin, { name: 'prisma' });
