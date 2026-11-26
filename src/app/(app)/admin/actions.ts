'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/admin';
import { demoMode } from '@/lib/demo';
import { waDigits } from '@/lib/phone';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { generateToken, hashToken } from '@/server/tokens';

// Admin actions. Each one first re-checks the admin (with MFA); the database checks it again (is_admin()).
// The plaintext link exists only here, in memory, and in the reply to the admin: only its hash is stored.

/** waUrl is null in the demo (nobody real to message): the admin opens the link herself instead */
export type InviteOut = { ok: true; who: string; message: string; waUrl: string | null; link: string } | { ok: false; error: string };

async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function pack(who: string, phone: string, message: string, link: string): InviteOut {
  const waUrl = demoMode() ? null : `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(message)}`;
  return { ok: true, who, message, waUrl, link };
}

export async function approveAction(applicationId: string): Promise<InviteOut> {
  await requireAdmin();
  const supabase = await supabaseServer();
  const token = generateToken();
  const { error } = await supabase.rpc('admin_approve', { p_application: applicationId, p_token_hash: hashToken(token) });
  if (error) return { ok: false, error: error.message === 'not_pending' ? 'this request was already decided.' : "couldn't approve. try again." };
  revalidatePath('/admin', 'layout');
  return invite(applicationId, token);
}

export async function resendInviteAction(applicationId: string): Promise<InviteOut> {
  await requireAdmin();
  const supabase = await supabaseServer();
  const token = generateToken();
  const { error } = await supabase.rpc('admin_resend_invite', { p_application: applicationId, p_token_hash: hashToken(token) });
  if (error) return { ok: false, error: "can't send a new link for this one." };
  revalidatePath('/admin', 'layout');
  return invite(applicationId, token);
}

async function invite(applicationId: string, token: string): Promise<InviteOut> {
  const supabase = await supabaseServer();
  const { data: app } = await supabase.from('applications').select('name, whatsapp_e164').eq('id', applicationId).single();
  if (!app) return { ok: false, error: "couldn't load her details." };
  const link = `${await siteUrl()}/j/${token}`;
  const message = `Hi ${first(app.name as string)}, welcome to Mesa! Your request is approved. Tap to create your password and get in: ${link} . The link works once and expires in 7 days. Please don't share it.`;
  return pack(first(app.name as string), app.whatsapp_e164 as string, message, link);
}

export async function rejectAction(applicationId: string): Promise<void> {
  await requireAdmin();
  const supabase = await supabaseServer();
  await supabase.rpc('admin_reject', { p_application: applicationId }); // sends nothing to her
  revalidatePath('/admin', 'layout');
}

export async function newLinkAction(profileId: string): Promise<InviteOut> {
  await requireAdmin();
  const supabase = await supabaseServer();
  const token = generateToken();
  const { error } = await supabase.rpc('admin_new_link', { p_profile: profileId, p_token_hash: hashToken(token) });
  if (error) return { ok: false, error: error.message === 'demo_protected' ? 'this account is protected in the demo.' : "can't make a link for her." };
  const { data: prof } = await supabase.from('profiles').select('name').eq('id', profileId).single();
  const { data: priv } = await supabase.from('member_private').select('whatsapp_e164').eq('user_id', profileId).single();
  if (!prof || !priv) return { ok: false, error: "couldn't load her details." };
  const link = `${await siteUrl()}/j/${token}`;
  const message = `Hi ${first(prof.name as string)}, here is your new Mesa link: ${link} . It works once and expires in 24 hours.`;
  revalidatePath('/admin', 'layout');
  return pack(first(prof.name as string), priv.whatsapp_e164 as string, message, link);
}

export async function removeMemberAction(profileId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_remove_member', { p_user: profileId });
  if (error) return { error: "couldn't remove her. try again." };
  // also stop her signing in or refreshing a session (the database already ended her access)
  await supabaseService().auth.admin.updateUserById(profileId, { ban_duration: '876000h' });
  revalidatePath('/', 'layout');
  return {};
}

export async function resolveReportAction(reportId: string): Promise<void> {
  await requireAdmin();
  const supabase = await supabaseServer();
  await supabase.rpc('admin_resolve_report', { p_report: reportId });
  revalidatePath('/admin', 'layout');
}
