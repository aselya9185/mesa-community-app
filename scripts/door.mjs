// Dev stand-in for the admin door list (the real screen comes last).
//   npm run door -- list
//   npm run door -- reports                    (open reports from members)
//   npm run door -- approve +34600111222      (approve a pending request, print the invite link)
//   npm run door -- resend  +34600111222      (fresh link for an approved request, or a reset link for a member)
// Uses the service role: local dev only.
import { service, loginEmail } from './lib.mjs';
import { generateToken, hashToken } from '../src/server/tokens.ts';

const svc = service();
const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const [cmd, phone] = process.argv.slice(2);

async function makeInvite({ applicationId, profileId, purpose }) {
  const token = generateToken();
  const ttl = purpose === 'invite' ? 7 * 86400 : 86400;
  const { error } = await svc.from('invites').insert({
    application_id: applicationId ?? null,
    profile_id: profileId ?? null,
    purpose,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + ttl * 1000 - 60_000).toISOString(),
  });
  if (error) throw error;
  return `${site}/j/${token}`;
}

if (cmd === 'list') {
  const { data: apps } = await svc.from('applications').select('name, instagram, whatsapp_e164, status, vouched_by, profile_id').order('created_at', { ascending: false }).limit(20);
  console.table(apps);
  const { data: reqs } = await svc.from('link_requests').select('application_id, profile_id, created_at').is('handled_at', null);
  console.log(`open link requests: ${reqs?.length ?? 0}`);
  if (reqs?.length) console.table(reqs);
} else if (cmd === 'reports') {
  const { data } = await svc.from('reports').select('created_at, reason, note, status, reporter:reporter_id(name), reported:reported_id(name)').eq('status', 'open').order('created_at', { ascending: false });
  console.table((data ?? []).map((r) => ({ when: r.created_at, reporter: r.reporter?.name, reported: r.reported?.name, reason: r.reason, note: r.note })));
} else if (cmd === 'approve' && phone) {
  const { data: app } = await svc.from('applications').select('id, name').eq('whatsapp_e164', phone).eq('status', 'pending').maybeSingle();
  if (!app) throw new Error('no pending request for that number');
  await svc.from('applications').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', app.id);
  const link = await makeInvite({ applicationId: app.id, purpose: 'invite' });
  console.log(`Hi ${app.name}, welcome to Mesa! Your request is approved. Tap to create your password and get in: ${link} . The link works once and expires in 7 days. Please don't share it.`);
} else if (cmd === 'resend' && phone) {
  const { data: priv } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', phone).maybeSingle();
  if (priv) {
    const link = await makeInvite({ profileId: priv.user_id, purpose: 'reset' });
    console.log(`reset link (24h): ${link}`);
  } else {
    const { data: app } = await svc.from('applications').select('id').eq('whatsapp_e164', phone).eq('status', 'approved').is('profile_id', null).maybeSingle();
    if (!app) throw new Error('nothing to resend for that number');
    console.log(`new invite link (7 days): ${await makeInvite({ applicationId: app.id, purpose: 'invite' })}`);
  }
} else {
  console.log('usage: npm run door -- list | reports | approve <+e164> | resend <+e164>');
}
void loginEmail;
