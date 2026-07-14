import type { FastifyInstance } from 'fastify';
import { AccountService, HCSService } from '@acquis/hedera-service';
import { logTransaction } from '../plugins/logTransaction';
import type { CreateAccountBody } from '../types';

interface CreditBody {
  amountCents: number;
  fundingRequestId: string;
}

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

  app.post<{ Params: { id: string }; Body: CreditBody }>(
    '/accounts/:id/credit',
    async (request, reply) => {
      const { id: hederaAccountId } = request.params;
      const { amountCents, fundingRequestId } = request.body ?? {};

      if (!amountCents || amountCents <= 0 || !fundingRequestId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'amountCents (positive) and fundingRequestId are required',
        });
      }

      const topicId = process.env.ACQUIS_CONSENT_HCS_TOPIC_ID ?? '0.0.9342744';

      const result = await HCSService.submitMessage({
        topic_id: topicId,
        message: JSON.stringify({
          type:             'credit.applied',
          hederaAccountId,
          amountCents,
          fundingRequestId,
          creditedAt:       new Date().toISOString(),
        }),
      });

      return reply.status(201).send({
        account_id:          hederaAccountId,
        amountCents,
        hcs_sequence_number: result.sequence_number,
        hcs_transaction_id:  result.transaction_id,
      });
    },
  );
}
