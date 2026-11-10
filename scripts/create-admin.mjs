// One-off bootstrap for the first admin (local or real project):
//   ADMIN_PHONE=+34600000000 ADMIN_NAME=Laia ADMIN_INSTAGRAM=@laia node scripts/create-admin.mjs
// The password is read from ADMIN_PASSWORD, or generated and printed once. Enrol TOTP after first login.
import { randomBytes } from 'node:crypto';
import { service, upsertMember } from './lib.mjs';

const { ADMIN_PHONE, ADMIN_NAME, ADMIN_INSTAGRAM } = process.env;
if (!ADMIN_PHONE || !/^\+[1-9][0-9]{7,14}$/.test(ADMIN_PHONE) || !ADMIN_NAME) {
  console.error('set ADMIN_PHONE (E.164, like +34600000000) and ADMIN_NAME');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
const id = await upsertMember(service(), {
  phone: ADMIN_PHONE,
  password,
  name: ADMIN_NAME,
  instagram: ADMIN_INSTAGRAM ?? null,
  role: 'admin',
});
console.log(`admin ready: ${ADMIN_NAME} (${id})`);
if (!process.env.ADMIN_PASSWORD) console.log(`one-time password (change it after login): ${password}`);
