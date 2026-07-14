import type { FastifyInstance } from 'fastify';
import { HCSService } from '@acquis/hedera-service';

interface ValidateInvoiceBody {
  fundingRequestId: string;
  hederaAccountId: string;
  amountCents: number;
}

export async function fundingRoutes(app: FastifyInstance) {
  app.post<{ Body: ValidateInvoiceBody }>('/funding/validate-invoice', async (request, reply) => {
    const { fundingRequestId, hederaAccountId, amountCents } = request.body ?? {};

    if (!fundingRequestId || !hederaAccountId || amountCents == null || amountCents <= 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'fundingRequestId, hederaAccountId, and a positive amountCents are required',
      });
    }

    const topicId = process.env.ACQUIS_CONSENT_HCS_TOPIC_ID ?? '0.0.9342744';

    const result = await HCSService.submitMessage({
      topic_id: topicId,
      message: JSON.stringify({
        type:             'invoice.validated',
        fundingRequestId,
        hederaAccountId,
        amountCents,
        validatedAt:      new Date().toISOString(),
      }),
    });

    return reply.status(201).send({
      valid:     true,
      topicId:   result.topic_id,
      messageId: result.transaction_id,
    });
  });
}
