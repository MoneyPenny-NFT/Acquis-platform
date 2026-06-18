import type { FastifyInstance } from 'fastify';
import { AccountService } from '@acquis/hedera-service';
import { logTransaction } from '../plugins/logTransaction';
import type { CreateAccountBody } from '../types';

export async function accountRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateAccountBody }>('/accounts', async (request, reply) => {
    const { initialHbar } = request.body ?? {};
    const result = await logTransaction(app, 'account_create', { initialHbar }, () =>
      AccountService.createAccount(initialHbar),
    );
    return reply.status(201).send(result);
  });

  app.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId',
    async (request, reply) => {
      const info = await AccountService.getAccountInfo(request.params.accountId);
      return reply.send(info);
    },
  );
}
