import { config } from 'dotenv';
config();                              // loads .env (safe defaults)
config({ path: '.env.local', override: true }); // loads .env.local (secrets)

import { buildApp } from './app';

const app = buildApp();

app.listen(
  { port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' },
  (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  },
);
