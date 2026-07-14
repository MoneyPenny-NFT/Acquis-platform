import type { FastifyInstance } from 'fastify';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// In-memory session store. Sufficient for single-instance MVP.
// Migrate to Redis (already in the stack for Bull) when going multi-instance.
const sessions = new Map<string, { email: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(token);
  }
}, 60_000);

// Password hash format stored in env: <salt_hex>:<pbkdf2_hex>
// Generate with:
//   node -e "
//     const {pbkdf2Sync,randomBytes}=require('crypto');
//     const salt=randomBytes(16);
//     const h=pbkdf2Sync('yourpassword',salt,100000,32,'sha256');
//     console.log(salt.toString('hex')+':'+h.toString('hex'));
//   "
function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const derived   = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 100_000, 32, 'sha256');
    const expected  = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export async function authRoutes(app: FastifyInstance) {
  const ADMIN_EMAIL = (process.env.DASHBOARD_ADMIN_EMAIL ?? '').toLowerCase();
  const ADMIN_HASH  = process.env.DASHBOARD_ADMIN_PASSWORD_HASH ?? '';

  // ── POST /auth/login ────────────────────────────────────────────────────
  app.post<{ Body: { email: string; password: string } }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' });
    }
    if (!ADMIN_EMAIL || !ADMIN_HASH) {
      app.log.error('DASHBOARD_ADMIN_EMAIL or DASHBOARD_ADMIN_PASSWORD_HASH not set');
      return reply.status(503).send({ error: 'Dashboard auth not configured on this server' });
    }

    // Constant-time email comparison (prevent timing oracle on username).
    let emailOk = false;
    try {
      const a = Buffer.from(email.toLowerCase());
      const b = Buffer.from(ADMIN_EMAIL);
      emailOk = a.length === b.length && timingSafeEqual(a, b);
    } catch { emailOk = false; }

    // Always run password check regardless of email result to prevent
    // timing-based username enumeration.
    const passwordOk = verifyPassword(password, ADMIN_HASH);

    if (!emailOk || !passwordOk) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = randomBytes(32).toString('hex');
    sessions.set(token, { email: ADMIN_EMAIL, expiresAt: Date.now() + SESSION_TTL_MS });
    return reply.send({ token, expiresIn: SESSION_TTL_MS / 1000 });
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────
  app.get('/auth/me', async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: 'Not authenticated' });
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      if (token) sessions.delete(token);
      return reply.status(401).send({ error: 'Session expired' });
    }
    return reply.send({ email: session.email });
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────
  app.post('/auth/logout', async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    if (token) sessions.delete(token);
    return reply.send({ ok: true });
  });
}
