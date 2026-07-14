import { FastifyInstance, FastifyReply } from 'fastify';
import {
  createSession,
  startIDV,
  completeIDV,
  startBankLink,
  completeBankLink,
  recordConsent,
  getSessionStatus,
} from '../services/onboarding.service';

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/onboarding/sessions', async (request, reply) => {
    const { email, phone } = request.body as { email: string; phone?: string };
    if (!email) return reply.status(400).send({ error: 'email is required' });
    const result = await createSession(email, phone);
    return reply.status(201).send(result);
  });

  app.get('/onboarding/sessions/:session_id', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    try {
      const status = await getSessionStatus(session_id);
      return reply.send(status);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post('/onboarding/sessions/:session_id/idv/start', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    try {
      const result = await startIDV(session_id);
      return reply.send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post('/onboarding/sessions/:session_id/idv/complete', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    const { idv_id } = request.body as { idv_id: string };
    if (!idv_id) return reply.status(400).send({ error: 'idv_id is required' });
    try {
      const result = await completeIDV(session_id, idv_id);
      return reply.send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post('/onboarding/sessions/:session_id/bank-link/start', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    try {
      const result = await startBankLink(session_id);
      return reply.send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post('/onboarding/sessions/:session_id/bank-link/complete', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    const { public_token } = request.body as { public_token: string };
    if (!public_token) return reply.status(400).send({ error: 'public_token is required' });
    try {
      const result = await completeBankLink(session_id, public_token);
      return reply.send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post('/onboarding/sessions/:session_id/consent', async (request, reply) => {
    const { session_id } = request.params as { session_id: string };
    try {
      const result = await recordConsent(session_id);
      return reply.send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });
}

function handleError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as { code?: string; message?: string };
  if (e.code === 'SESSION_EXPIRED') return reply.status(410).send({ error: 'Session expired' });
  if (e.code === 'STEP_ORDER') return reply.status(409).send({ error: e.message });
  if (e.message?.includes('No OnboardingSession found')) {
    return reply.status(404).send({ error: 'Session not found' });
  }
  return reply.status(500).send({ error: 'Internal server error' });
}
