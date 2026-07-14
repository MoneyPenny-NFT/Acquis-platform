import { getApp, authHeader } from '../helpers';

jest.mock('../../src/plugins/prisma', () => ({
  default: async (app: any) => {
    app.decorate('prisma', {});
    app.decorate('dbReady', false);
    app.addHook('onClose', async () => {});
  },
}));

describe('Onboarding routes — KYC feature flag', () => {
  const app = getApp();
  afterAll(() => app.close());

  beforeEach(() => {
    delete process.env.KYC_ENFORCEMENT_ENABLED;
  });

  const routes = [
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions', payload: { email: 'a@b.com' } },
    { method: 'GET' as const, url: '/api/v1/onboarding/sessions/sess-1' },
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions/sess-1/idv/start' },
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions/sess-1/idv/complete', payload: { idv_id: 'x' } },
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions/sess-1/bank-link/start' },
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions/sess-1/bank-link/complete', payload: { public_token: 'p' } },
    { method: 'POST' as const, url: '/api/v1/onboarding/sessions/sess-1/consent' },
  ];

  it.each(routes)(
    '$method $url returns 501 when KYC_ENFORCEMENT_ENABLED is not set',
    async ({ method, url, payload }) => {
      const res = await app.inject({ method, url, payload, headers: authHeader });
      expect(res.statusCode).toBe(501);
      const body = res.json<{ error: string; message: string }>();
      expect(body.error).toBe('Not Implemented');
      expect(body.message).toContain('KYC_ENFORCEMENT_ENABLED=true');
    },
  );

  it('POST /api/v1/onboarding/sessions returns 501 when KYC_ENFORCEMENT_ENABLED=false', async () => {
    process.env.KYC_ENFORCEMENT_ENABLED = 'false';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/sessions',
      payload: { email: 'a@b.com' },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(501);
  });

  it('POST /api/v1/onboarding/sessions proxies to onboarding-service when KYC_ENFORCEMENT_ENABLED=true', async () => {
    process.env.KYC_ENFORCEMENT_ENABLED = 'true';
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      status: 201,
      json: async () => ({ session_id: 'stub-session-uuid' }),
    } as Response);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/sessions',
      payload: { email: 'a@b.com' },
      headers: authHeader,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ session_id: 'stub-session-uuid' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/onboarding/sessions'),
      expect.objectContaining({ method: 'POST' }),
    );
    mockFetch.mockRestore();
    delete process.env.KYC_ENFORCEMENT_ENABLED;
  });
});
