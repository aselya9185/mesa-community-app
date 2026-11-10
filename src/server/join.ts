import type { SupabaseClient } from '@supabase/supabase-js';
import { loginEmail } from '@/lib/phone';
import { hashToken, isWellFormedToken } from './tokens';

// Redeeming an invite or a reset link. Runs with the SERVICE client.
// The single-use + expiry guarantee comes from the database (claim_invite is one atomic UPDATE).

export type Purpose = 'invite' | 'reset';
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (what Supabase Auth uses) ignores anything beyond 72 bytes

export const JOIN_LIMIT = { max: 20, windowSeconds: 3600 };

export type JoinPreview = { ok: true; purpose: Purpose; firstName: string } | { ok: false };

/** read-only: used to render the join page. Never consumes the token (link previews hit this too). */
export async function previewInvite(svc: SupabaseClient, token: string): Promise<JoinPreview> {
  if (!isWellFormedToken(token)) return { ok: false };
  const hash = hashToken(token);
  for (const purpose of ['invite', 'reset'] as const) {
    const { data: valid } = await svc.rpc('peek_invite', { p_hash: hash, p_purpose: purpose });
    if (valid !== true) continue;
    const { data: row } = await svc
      .from('invites')
      .select('application_id, profile_id')
      .eq('token_hash', hash)
      .single();
    if (!row) return { ok: false };
    if (purpose === 'invite' && row.application_id) {
      const { data: app } = await svc.from('applications').select('name, status, profile_id').eq('id', row.application_id).single();
      if (!app || app.status !== 'approved' || app.profile_id) return { ok: false };
      return { ok: true, purpose, firstName: firstName(app.name as string) };
    }
    if (purpose === 'reset' && row.profile_id) {
      const { data: prof } = await svc.from('profiles').select('name, status').eq('id', row.profile_id).single();
      if (!prof || prof.status !== 'active') return { ok: false };
      return { ok: true, purpose, firstName: firstName(prof.name as string) };
    }
  }
  return { ok: false };
}

export type RedeemResult =
  | { ok: true; purpose: Purpose; userId: string; phone: string }
  | { ok: false; error: 'invalid_link' | 'weak_password' | 'rate_limited' | 'failed' };

export async function redeemInvite(
  svc: SupabaseClient,
  token: string,
  password: string,
  ctx: { ipHash: string },
): Promise<RedeemResult> {
  if (!isWellFormedToken(token)) return { ok: false, error: 'invalid_link' };
  // a wrong password must not burn the link: check it before claiming
  if (password.length < PASSWORD_MIN || new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return { ok: false, error: 'weak_password' };
  }
  const { data: allowed } = await svc.rpc('rate_limit_hit', {
    p_key: `join:ip:${ctx.ipHash}`,
    p_max: JOIN_LIMIT.max,
    p_window_seconds: JOIN_LIMIT.windowSeconds,
  });
  if (allowed !== true) return { ok: false, error: 'rate_limited' };

  const hash = hashToken(token);
  for (const purpose of ['invite', 'reset'] as const) {
    const { data: claimed, error } = await svc.rpc('claim_invite', { p_hash: hash, p_purpose: purpose });
    if (error) return { ok: false, error: 'failed' };
    const row = (claimed as { id: string; application_id: string | null; profile_id: string | null }[] | null)?.[0];
    if (!row) continue;
    const release = async () => {
      await svc.rpc('release_invite', { p_id: row.id });
    };
    try {
      const result = purpose === 'invite' ? await createMember(svc, row.application_id, password) : await resetPassword(svc, row.profile_id, password);
      if (!result) {
        await release();
        return { ok: false, error: 'failed' };
      }
      return { ok: true, purpose, ...result };
    } catch {
      await release();
      return { ok: false, error: 'failed' };
    }
  }
  return { ok: false, error: 'invalid_link' };
}

async function createMember(svc: SupabaseClient, applicationId: string | null, password: string) {
  if (!applicationId) return null;
  const { data: app } = await svc
    .from('applications')
    .select('id, name, instagram, whatsapp_e164, status, profile_id')
    .eq('id', applicationId)
    .single();
  if (!app || app.status !== 'approved' || app.profile_id) return null;
  const phone = app.whatsapp_e164 as string;

  const { data: created, error } = await svc.auth.admin.createUser({ email: loginEmail(phone), password, email_confirm: true });
  if (error || !created.user) return null; // e.g. she is already a member
  const userId = created.user.id;

  const fail = async () => {
    await svc.auth.admin.deleteUser(userId); // cascades to anything inserted below
    return null;
  };
  const p = await svc.from('profiles').insert({ id: userId, name: app.name, instagram: app.instagram });
  if (p.error) return fail();
  const m = await svc.from('member_private').insert({ user_id: userId, whatsapp_e164: phone });
  if (m.error) return fail();
  await svc.from('applications').update({ profile_id: userId }).eq('id', app.id);
  await svc.from('link_requests').update({ handled_at: new Date().toISOString() }).eq('application_id', app.id).is('handled_at', null);
  return { userId, phone };
}

async function resetPassword(svc: SupabaseClient, profileId: string | null, password: string) {
  if (!profileId) return null;
  const { data: prof } = await svc.from('profiles').select('id, status').eq('id', profileId).single();
  if (!prof || prof.status !== 'active') return null;
  const { data: priv } = await svc.from('member_private').select('whatsapp_e164').eq('user_id', profileId).single();
  if (!priv) return null;
  const { error } = await svc.auth.admin.updateUserById(profileId, { password });
  if (error) return null;
  await svc.from('link_requests').update({ handled_at: new Date().toISOString() }).eq('profile_id', profileId).is('handled_at', null);
  return { userId: profileId, phone: priv.whatsapp_e164 as string };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}
