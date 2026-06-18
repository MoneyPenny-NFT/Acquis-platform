import type { FastifyInstance } from 'fastify';
import type { FundingService } from '../services/FundingService';

interface CreateBody {
  hederaAccountId: string;
  mandateRef: string;
  perTxLimitCents: number;
  periodLimitCents: number;
  periodDays?: number;
  expiresAt: string; // ISO date string
}

export function standingApprovalRoutes(service: FundingService) {
  return async (app: FastifyInstance) => {

    app.post<{ Body: CreateBody }>('/standing-approvals', {
      schema: {
        body: {
          type: 'object',
          required: ['hederaAccountId', 'mandateRef', 'perTxLimitCents', 'periodLimitCents', 'expiresAt'],
          properties: {
            hederaAccountId:  { type: 'string' },
            mandateRef:       { type: 'string' },
            perTxLimitCents:  { type: 'integer', minimum: 1 },
            periodLimitCents: { type: 'integer', minimum: 1 },
            periodDays:       { type: 'integer', minimum: 1 },
            expiresAt:        { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      const approval = await service.createStandingApproval({
        ...request.body,
        expiresAt: new Date(request.body.expiresAt),
      });
      return reply.status(201).send(approval);
    });

    app.get<{ Querystring: { hederaAccountId: string } }>(
      '/standing-approvals',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['hederaAccountId'],
            properties: { hederaAccountId: { type: 'string' } },
          },
        },
      },
      async (request) => {
        return service.getStandingApprovals(request.query.hederaAccountId);
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/standing-approvals/:id',
      async (request, reply) => {
        const approval = await service.revokeStandingApproval(request.params.id);
        return reply.send(approval);
      },
    );
  };
}
