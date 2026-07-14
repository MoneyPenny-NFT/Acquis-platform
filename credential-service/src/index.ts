import 'dotenv/config';
import { buildApp } from './app';

const PORT = parseInt(process.env.CREDENTIAL_SERVICE_PORT ?? '3002', 10);

const app = buildApp();
app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`credential-service listening at ${address}`);
});
