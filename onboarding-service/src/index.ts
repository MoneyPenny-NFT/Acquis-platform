import 'dotenv/config';
import { buildApp } from './app';

const PORT = parseInt(process.env.ONBOARDING_SERVICE_PORT ?? '3003', 10);

const app = buildApp();
app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`onboarding-service listening at ${address}`);
});
