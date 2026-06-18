import type { FastifyInstance } from 'fastify';
import { TokenService } from '@acquis/hedera-service';
import { logTransaction } from '../plugins/logTransaction';
import type { CreateTokenBody, MintTokenBody, BurnTokenBody, AssociateTokenBody } from '../types';

export async function tokenRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateTokenBody }>('/tokens', async (request, reply) => {
    const result = await logTransaction(app, 'token_create', request.body, () =>
      TokenService.createToken(request.body),
    );
    return reply.status(201).send(result);
  });

  app.post<{ Params: { tokenId: string }; Body: MintTokenBody }>(
    '/tokens/:tokenId/mint',
    async (request, reply) => {
      const { tokenId } = request.params;
      const { supplyKey, amount } = request.body;
      const receipt = await logTransaction(app, 'token_mint', { tokenId, amount }, () =>
        TokenService.mintTokens(tokenId, supplyKey, amount),
      ) as Awaited<ReturnType<typeof TokenService.mintTokens>>;
      return reply.send({ tokenId, minted: amount, status: receipt.status.toString() });
    },
  );

  app.post<{ Params: { tokenId: string }; Body: BurnTokenBody }>(
    '/tokens/:tokenId/burn',
    async (request, reply) => {
      const { tokenId } = request.params;
      const { supplyKey, amount } = request.body;
      const receipt = await logTransaction(app, 'token_burn', { tokenId, amount }, () =>
        TokenService.burnTokens(tokenId, supplyKey, amount),
      ) as Awaited<ReturnType<typeof TokenService.burnTokens>>;
      return reply.send({ tokenId, burned: amount, status: receipt.status.toString() });
    },
  );

  app.post<{ Params: { tokenId: string }; Body: AssociateTokenBody }>(
    '/tokens/:tokenId/associate',
    async (request, reply) => {
      const { tokenId } = request.params;
      const { accountId, accountKey } = request.body;
      await logTransaction(app, 'token_associate', { tokenId, accountId }, () =>
        TokenService.associateToken(accountId, accountKey, [tokenId]),
      );
      return reply.status(204).send();
    },
  );
}
