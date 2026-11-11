// Generates a VAPID key pair for web push and a webhook secret. Prints them once: copy into your env, never commit.
//   node scripts/vapid.mjs
import { randomBytes } from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';

const keys = generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # a contact address for push services');
console.log(`PUSH_WEBHOOK_SECRET=${randomBytes(32).toString('base64url')}`);
