// Erase a person completely (a "delete my data" request): her login, card, number, photos, plans she hosted,
// messages, notifications, devices, votes, blocks and reports she sent. This CANNOT be undone.
//   ERASE_PHONE=+34600000000 CONFIRM=erase node scripts/erase-member.mjs
// Works for a member, or for someone who only ever applied (her application is removed too).
// Uses the service role (local stack by default; for the real project set NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in your shell).
import { service } from './lib.mjs';

const phone = process.env.ERASE_PHONE;
if (!phone || !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
  console.error('set ERASE_PHONE to her number in E.164 form, like +34600000000');
  process.exit(1);
}
if (process.env.CONFIRM !== 'erase') {
  console.error('this is permanent. add CONFIRM=erase to go ahead.');
  process.exit(1);
}
const svc = service();
const report = [];

const { data: priv } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', phone).maybeSingle();
if (priv) {
  const id = priv.user_id;
  const { data: prof } = await svc.from('profiles').select('role').eq('id', id).single();
  if (prof?.role === 'admin') throw new Error('this is an admin account: demote it first');
  // photos
  const { data: files } = await svc.storage.from('avatars').list(id);
  if (files?.length) await svc.storage.from('avatars').remove(files.map((f) => `${id}/${f.name}`));
  report.push(`photos: ${files?.length ?? 0}`);
  // login, card, number, memberships, plans she hosted, messages' sender, notifications, devices, votes, blocks: all cascade
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) throw error;
  report.push('account: deleted');
}

const { data: apps } = await svc.from('applications').delete().eq('whatsapp_e164', phone).select('id');
report.push(`applications: ${apps?.length ?? 0}`);
await svc.from('admin_events').insert({ action: 'erase_person', subject: priv ? 'member erased' : 'applicant erased' });
console.log(`erased ${phone.slice(0, 4)}…${phone.slice(-2)} → ${report.join(', ')}`);
