import type { FastifyInstance } from 'fastify';
import type { EnrollmentService, EnrollParams, MetadataUpdateParams } from '../services/enrollment.service';

export function credentialRoutes(service: EnrollmentService) {
  return async function (app: FastifyInstance) {
    app.post<{ Body: EnrollParams }>('/credentials/enroll', async (request, reply) => {
      const { acquis_id, hedera_account_id, xrpl_address, tier } = request.body;
      if (!acquis_id || !hedera_account_id || !xrpl_address || !tier) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'acquis_id, hedera_account_id, xrpl_address, and tier are required' });
      }
      const result = await service.enroll({ acquis_id, hedera_account_id, xrpl_address, tier });
      return reply.status(201).send(result);
    });

    app.post<{ Body: MetadataUpdateParams }>('/credentials/update-metadata', async (request, reply) => {
      const { acquis_id, aqs_balance_delta, last_updated, reason } = request.body;
      if (!acquis_id || aqs_balance_delta == null || !last_updated || !reason) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'acquis_id, aqs_balance_delta, last_updated, and reason are required' });
      }
      const result = await service.updateMetadata({ acquis_id, aqs_balance_delta, last_updated, reason });
      return reply.send(result);
    });

    app.post<{ Body: { acquis_id: string } }>('/credentials/suspend', async (request, reply) => {
      const { acquis_id } = request.body;
      if (!acquis_id) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'acquis_id is required' });
      }
      const result = await service.suspend(acquis_id);
      return reply.send(result);
    });

    app.get<{ Params: { acquis_id: string } }>('/credentials/:acquis_id', async (request, reply) => {
      const result = await service.getCredentialState(request.params.acquis_id);
      return reply.send(result);
    });

    app.post<{ Body: { merchant_xrpl_address: string } }>('/credentials/configure-merchant-preauth', async (request, reply) => {
      const { merchant_xrpl_address } = request.body;
      if (!merchant_xrpl_address) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'merchant_xrpl_address is required' });
      }
      const result = await service.configureMerchantPreauth(merchant_xrpl_address);
      return reply.send(result);
    });
  };
}
