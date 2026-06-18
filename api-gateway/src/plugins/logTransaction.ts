import type { FastifyInstance } from 'fastify';

export async function logTransaction(
  app: FastifyInstance,
  type: string,
  payload: unknown,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  if (!app.dbReady) return fn();

  const record = await app.prisma.transaction.create({
    data: { type, status: 'pending', payload: JSON.stringify(payload) },
  });

  try {
    const result = await fn();
    await app.prisma.transaction.update({
      where: { id: record.id },
      data: { status: 'completed', result: JSON.stringify(result) },
    });
    return result;
  } catch (err) {
    await app.prisma.transaction.update({
      where: { id: record.id },
      data: { status: 'failed', error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
