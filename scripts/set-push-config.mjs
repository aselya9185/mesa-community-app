// Tells the database where to send "a notification was created".
//   node scripts/set-push-config.mjs http://host.docker.internal:3000/api/push     (local)
//   node scripts/set-push-config.mjs https://your-app.vercel.app/api/push          (production)
// The secret comes from PUSH_WEBHOOK_SECRET in your shell or .env.local. It is stored only in the database.
import { readFileSync, existsSync } from 'node:fs';
import { service } from './lib.mjs';

const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error('usage: node scripts/set-push-config.mjs <https://…/api/push>');
  process.exit(1);
}
let secret = process.env.PUSH_WEBHOOK_SECRET;
if (!secret && existsSync('.env.local')) {
  secret = readFileSync('.env.local', 'utf8').match(/^PUSH_WEBHOOK_SECRET=(.+)$/m)?.[1];
}
if (!secret) {
  console.error('PUSH_WEBHOOK_SECRET is not set');
  process.exit(1);
}
const { error } = await service().from('push_config').upsert({ id: 1, url, secret });
if (error) throw error;
console.log(`push hand-off set to ${url}`);
