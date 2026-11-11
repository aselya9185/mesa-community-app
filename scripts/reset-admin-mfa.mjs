// Lost your phone? Removes the admin's authenticator so she can set up two-step sign-in again.
//   ADMIN_PHONE=+34600000000 node scripts/reset-admin-mfa.mjs
// Needs the service role (local stack by default; for the real project set NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in your shell). After this, log in and the door list shows the QR setup again.
import { service } from './lib.mjs';

const phone = process.env.ADMIN_PHONE;
if (!phone || !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
  console.error('set ADMIN_PHONE to the admin number in E.164 form, like +34600000000');
  process.exit(1);
}
const svc = service();
const { data: priv } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', phone).maybeSingle();
if (!priv) throw new Error('no member with that number');
const { data: prof } = await svc.from('profiles').select('role, name').eq('id', priv.user_id).single();
if (prof?.role !== 'admin') throw new Error('that member is not the admin');

const { data, error } = await svc.auth.admin.mfa.listFactors({ userId: priv.user_id });
if (error) throw error;
const factors = data?.factors ?? [];
for (const f of factors) {
  const r = await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId: priv.user_id });
  if (r.error) throw r.error;
}
await svc.from('admin_events').insert({ admin_id: priv.user_id, action: 'reset_mfa', subject: 'by script' });
console.log(`removed ${factors.length} authenticator(s) for ${prof.name}. log in to set up a new one.`);
