import type { FastifyInstance } from 'fastify';
import { TransferService } from '@acquis/hedera-service';
import { logTransaction } from '../plugins/logTransaction';
import type { TransferHbarBody, TransferTokenBody } from '../types';

export async function transferRoutes(app: FastifyInstance) {
  app.post<{ Body: TransferHbarBody }>('/transfers/hbar', async (request, reply) => {
    const { fromId, fromKey, toId, amount } = request.body;
    await logTransaction(app, 'transfer_hbar', { fromId, toId, amount }, () =>
      TransferService.transferHbar(fromId, fromKey, toId, amount),
    );
    return reply.send({ fromId, toId, amount, asset: 'HBAR' });
  });

  app.post<{ Body: TransferTokenBody }>('/transfers/token', async (request, reply) => {
    const { tokenId, fromId, fromKey, toId, amount } = request.body;
    await logTransaction(app, 'transfer_token', { tokenId, fromId, toId, amount }, () =>
      TransferService.transferToken(tokenId, fromId, fromKey, toId, amount),
    );
    return reply.send({ tokenId, fromId, toId, amount });
  });
}
