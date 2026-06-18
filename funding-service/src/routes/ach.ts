import type { FastifyInstance } from 'fastify';
import type { FundingService } from '../services/FundingService';

interface CreateAchBody {
  hederaAccountId: string;
  routingNumber: string;
  accountNumber: string;
  accountNumberMask: string;
  authType: 'PPD' | 'CCD' | 'WEB';
  authDate: string;
}

export function achRoutes(service: FundingService) {
  return async (app: FastifyInstance) => {
    app.post<{ Body: CreateAchBody }>('/ach-authorizations', {
      schema: {
        body: {
          type: 'object',
          required: ['hederaAccountId', 'routingNumber', 'accountNumber', 'accountNumberMask', 'authType', 'authDate'],
          properties: {
            hederaAccountId:   { type: 'string' },
            routingNumber:     { type: 'string', pattern: '^[0-9]{9}$' },
            accountNumber:     { type: 'string' },
            accountNumberMask: { type: 'string' },
            authType:          { type: 'string', enum: ['PPD', 'CCD', 'WEB'] },
            authDate:          { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      const auth = await service.createAchAuthorization({
        ...request.body,
        authDate: new Date(request.body.authDate),
      });
      // Never return routingNumber or full account number in response
      const { ...safeAuth } = auth;
      return reply.status(201).send(safeAuth);
    });
  };
}
