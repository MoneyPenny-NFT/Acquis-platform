import 'dotenv/config';
import { buildApp } from './app';

const port = parseInt(process.env.PORT ?? '3002', 10);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp();

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`funding-service listening at ${address}`);
});
