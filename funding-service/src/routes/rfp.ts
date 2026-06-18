import type { FastifyInstance } from 'fastify';
import type { FundingService } from '../services/FundingService';
import { FundingValidationError } from '../services/FundingService';

interface CreateRfPBody {
  idempotencyKey: string;
  hederaAccountId: string;
  amountCents: number;
  standingApprovalId: string;
  currency?: string;
  expiresAt?: string;
}

export function rfpRoutes(service: FundingService) {
  return async (app: FastifyInstance) => {

    app.post<{ Body: CreateRfPBody }>('/rfp', {
      schema: {
        body: {
          type: 'object',
          required: ['idempotencyKey', 'hederaAccountId', 'amountCents', 'standingApprovalId'],
          properties: {
            idempotencyKey:    { type: 'string' },
            hederaAccountId:   { type: 'string' },
            amountCents:       { type: 'integer', minimum: 1 },
            standingApprovalId: { type: 'string' },
            currency:          { type: 'string' },
            expiresAt:         { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      try {
        const req = await service.createRfP({
          ...request.body,
          expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : undefined,
        });
        return reply.status(201).send(req);
      } catch (err) {
        if (err instanceof FundingValidationError) {
          return reply.status(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: err.message,
          });
        }
        throw err;
      }
    });

    app.get<{ Params: { id: string } }>('/rfp/:id', async (request, reply) => {
      const req = await service.getFundingRequest(request.params.id);
      if (!req) return reply.status(404).send({ message: 'Not found' });
      return req;
    });
  };
}
