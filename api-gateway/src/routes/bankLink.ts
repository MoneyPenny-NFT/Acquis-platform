import type { FastifyInstance } from 'fastify';
import * as PlaidService from '../services/plaid';
import * as StripeService from '../services/stripe';
import { encrypt, decrypt } from '../lib/crypto';

interface LinkTokenBody {
  hederaAccountId: string;
}

interface ExchangeBody {
  hederaAccountId: string;
  publicToken: string;
  accountId: string;
}

export async function bankLinkRoutes(app: FastifyInstance) {
  // Step 1: frontend calls this to get a Plaid Link token, then opens the Link modal
  app.post<{ Body: LinkTokenBody }>('/bank-link/token', async (request, reply) => {
    const { hederaAccountId } = request.body;
    if (!hederaAccountId) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'hederaAccountId is required' });
    }
    try {
      const linkToken = await PlaidService.createLinkToken(hederaAccountId);
      return reply.send({ linkToken });
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Plaid is not configured' });
    }
  });

  // Step 2: frontend sends back the public token after user completes Plaid Link
  app.post<{ Body: ExchangeBody }>('/bank-link/exchange', async (request, reply) => {
    const { hederaAccountId, publicToken, accountId } = request.body;
    if (!hederaAccountId || !publicToken || !accountId) {
      return reply.status(400).send({
        statusCode: 400, error: 'Bad Request',
        message: 'hederaAccountId, publicToken, and accountId are required',
      });
    }

    if (!app.dbReady) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });
    }

    try {
      const { accessToken } = await PlaidService.exchangePublicToken(publicToken);
      const { institutionName, accounts } = await PlaidService.getAccountInfo(accessToken);

      const linked = accounts.find(a => a.accountId === accountId);
      if (!linked) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'accountId not found among linked accounts' });
      }

      const stripeToken = await PlaidService.createStripeProcessorToken(accessToken, accountId);
      const { stripeCustomerId, stripeSourceId } = await StripeService.createCustomerWithBankAccount(
        stripeToken,
        hederaAccountId,
      );

      const { ciphertext, iv, tag } = encrypt(accessToken);
      const record = await app.prisma.bankAccount.create({
        data: {
          hederaAccountId,
          institutionName,
          accountMask: linked.mask,
          accountType: linked.type,
          plaidAccountId: accountId,
          encryptedToken: ciphertext,
          tokenIv: iv,
          tokenTag: tag,
          stripeCustomerId,
          stripeSourceId,
        },
      });

      return reply.status(201).send({
        bankAccountId: record.id,
        institutionName: record.institutionName,
        accountMask: record.accountMask,
        accountType: record.accountType,
      });
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Bank linking failed' });
    }
  });

  // List linked accounts (masked — no tokens or sensitive data returned)
  app.get<{ Querystring: { hederaAccountId: string } }>('/bank-link', async (request, reply) => {
    const { hederaAccountId } = request.query;
    if (!hederaAccountId) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'hederaAccountId query param is required' });
    }

    if (!app.dbReady) return reply.send({ accounts: [] });

    const accounts = await app.prisma.bankAccount.findMany({
      where: { hederaAccountId, status: 'active' },
      select: { id: true, institutionName: true, accountMask: true, accountType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ accounts });
  });

  // Unlink a bank account — removes Plaid item and marks record inactive
  app.delete<{ Params: { id: string }; Querystring: { hederaAccountId: string } }>(
    '/bank-link/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { hederaAccountId } = request.query;

      if (!app.dbReady) {
        return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Database unavailable' });
      }

      const account = await app.prisma.bankAccount.findFirst({
        where: { id, hederaAccountId, status: 'active' },
      });

      if (!account) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Bank account not found' });
      }

      try {
        const accessToken = decrypt({ ciphertext: account.encryptedToken, iv: account.tokenIv, tag: account.tokenTag });
        await PlaidService.removeItem(accessToken);
      } catch (err) {
        app.log.warn({ err }, 'Failed to remove Plaid item — proceeding with unlink');
      }

      await app.prisma.bankAccount.update({ where: { id }, data: { status: 'unlinked' } });

      return reply.status(204).send();
    },
  );
}
