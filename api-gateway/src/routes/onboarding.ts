import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

function kycEnabled(): boolean {
  return process.env.KYC_ENFORCEMENT_ENABLED === 'true';
}

function onboardingServiceUrl(): string {
  return process.env.ONBOARDING_SERVICE_URL ?? 'http://localhost:3003';
}

function placeholderResponse(reply: FastifyReply) {
  return reply.status(501).send({
    statusCode: 501,
    error: 'Not Implemented',
    message: 'KYC onboarding is not yet enabled. Set KYC_ENFORCEMENT_ENABLED=true once attorney CIP documentation is complete.',
  });
}

async function proxyPost(request: FastifyRequest, reply: FastifyReply, path: string) {
  const base = onboardingServiceUrl();
  const res = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request.body),
  });
  const data = await res.json();
  return reply.status(res.status).send(data);
}

async function proxyGet(request: FastifyRequest, reply: FastifyReply, path: string) {
  const base = onboardingServiceUrl();
  const res = await fetch(`${base}/api/v1${path}`);
  const data = await res.json();
  return reply.status(res.status).send(data);
}

export async function onboardingRoutes(app: FastifyInstance) {
  app.post('/onboarding/sessions', async (request, reply) => {
    if (!kycEnabled()) return placeholderResponse(reply);
    return proxyPost(request, reply, '/onboarding/sessions');
  });

  app.get<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyGet(request, reply, `/onboarding/sessions/${request.params.session_id}`);
    },
  );

  app.post<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id/idv/start',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyPost(request, reply, `/onboarding/sessions/${request.params.session_id}/idv/start`);
    },
  );

  app.post<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id/idv/complete',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyPost(request, reply, `/onboarding/sessions/${request.params.session_id}/idv/complete`);
    },
  );

  app.post<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id/bank-link/start',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyPost(request, reply, `/onboarding/sessions/${request.params.session_id}/bank-link/start`);
    },
  );

  app.post<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id/bank-link/complete',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyPost(request, reply, `/onboarding/sessions/${request.params.session_id}/bank-link/complete`);
    },
  );

  app.post<{ Params: { session_id: string } }>(
    '/onboarding/sessions/:session_id/consent',
    async (request, reply) => {
      if (!kycEnabled()) return placeholderResponse(reply);
      return proxyPost(request, reply, `/onboarding/sessions/${request.params.session_id}/consent`);
    },
  );
}
