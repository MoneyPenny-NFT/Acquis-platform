import type { FastifyInstance } from 'fastify';
import { HCSService } from '@acquis/hedera-service';

interface HCSWriteBody {
  topic_id: string;
  message: string;
  submit_key?: string;
}

export async function hcsRoutes(app: FastifyInstance) {
  app.post<{ Body: HCSWriteBody }>('/hcs/write', async (request, reply) => {
    const { topic_id, message, submit_key } = request.body;
    if (!topic_id || !message) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'topic_id and message are required' });
    }
    const result = await HCSService.submitMessage({ topic_id, message, submit_key });
    return reply.status(201).send(result);
  });
}
