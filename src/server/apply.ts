import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { handleKey, displayHandle, isValidHandle } from '@/lib/instagram';
import { normalizePhone } from '@/lib/phone';

// The public apply form. Runs with the SERVICE client (visitors have no database access at all).
// It never reveals a link and never confirms who is a member unless number AND instagram both match.

export type ApplyIntent = 'apply' | 'request_link';
export type ApplyState =
  | 'listed' //          "you're on the list" (new request, or we can't say more)
  | 'pending' //         matched, still being reviewed
  | 'approved' //        matched, approved, link not used yet
  | 'member' //          matched, already a member
  | 'link_requested' //  the door list was flagged: the admin will send a fresh link
  | 'invalid'
  | 'rate_limited';

export type ApplyInput = {
  name?: string;
  instagram: string;
  whatsapp: string;
  invitedBy?: string;
  vouchCode?: string;
  website?: string; // honeypot: real people leave it empty
  intent?: ApplyIntent;
};

export type ApplyResult = { state: ApplyState; errors?: Partial<Record<'name' | 'instagram' | 'whatsapp' | 'invitedBy', string>> };

const schema = z.object({
  name: z.string().trim().min(1, 'tell us your name').max(60),
  instagram: z.string().trim().refine(isValidHandle, 'that does not look like an instagram handle'),
  invitedBy: z.string().trim().refine(isValidHandle, 'type her instagram handle, like @name, or leave it empty').optional(),
});

export const LIMITS = {
  applyPerIp: { max: 5, windowSeconds: 3600 },
  applyPerNumber: { max: 10, windowSeconds: 86400 },
};

async function allowed(svc: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await svc.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw new Error(`rate limiter failed: ${error.message}`);
  return data === true;
}

type Checked =
  | { ok: true; e164: string; data: z.infer<typeof schema> }
  | { ok: false; errors: NonNullable<ApplyResult['errors']> };

/** is what was typed usable? Looks nothing up and stores nothing. */
export function checkApply(input: ApplyInput): Checked {
  const e164 = normalizePhone(input.whatsapp ?? '');
  const parsed = schema.safeParse({
    // a re-request ("didn't get my link") re-confirms with number + instagram only
    name: input.intent === 'request_link' ? (input.name?.trim() || 'x') : input.name,
    instagram: input.instagram ?? '',
    invitedBy: input.invitedBy?.trim() || undefined,
  });
  if (e164 && parsed.success) return { ok: true, e164, data: parsed.data };
  const errors: NonNullable<ApplyResult['errors']> = {};
  if (!e164) errors.whatsapp = 'that number does not look right. include your country code, like +34';
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k === 'name' || k === 'instagram' || k === 'invitedBy') errors[k] = issue.message;
    }
  }
  return { ok: false, errors };
}

export async function handleApply(svc: SupabaseClient, input: ApplyInput, ctx: { ipHash: string }): Promise<ApplyResult> {
  // bots fill hidden fields: answer exactly like a success, store nothing
  if (input.website && input.website.trim() !== '') return { state: 'listed' };

  const intent: ApplyIntent = input.intent ?? 'apply';
  const checked = checkApply(input);
  if (!checked.ok) return { state: 'invalid', errors: checked.errors };
  const { e164, data } = checked;

  if (!(await allowed(svc, `apply:ip:${ctx.ipHash}`, LIMITS.applyPerIp.max, LIMITS.applyPerIp.windowSeconds))) return { state: 'rate_limited' };
  if (!(await allowed(svc, `apply:num:${e164}`, LIMITS.applyPerNumber.max, LIMITS.applyPerNumber.windowSeconds))) return { state: 'rate_limited' };

  const ig = handleKey(data.instagram);

  // 1) already a member?
  const { data: priv } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', e164).maybeSingle();
  if (priv) {
    const [{ data: prof }, { data: own }] = await Promise.all([
      svc.from('profiles').select('id, status').eq('id', priv.user_id).single(),
      svc.from('member_instagram').select('handle').eq('user_id', priv.user_id).maybeSingle(),
    ]);
    if (prof && prof.status === 'active') {
      if (handleKey((own?.handle as string | undefined) ?? '') !== ig) return { state: 'listed' }; // can't confirm: say nothing
      if (intent === 'request_link') return flag(svc, { profile_id: prof.id as string });
      return { state: 'member' };
    }
    // removed members may ask again: falls through to a fresh application
  }

  // 2) an earlier application?
  const { data: last } = await svc
    .from('applications')
    .select('id, instagram, status, profile_id')
    .eq('whatsapp_e164', e164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last && last.status === 'pending') {
    return handleKey(last.instagram as string) === ig ? { state: 'pending' } : { state: 'listed' };
  }
  if (last && last.status === 'approved' && !last.profile_id) {
    if (handleKey(last.instagram as string) !== ig) return { state: 'listed' };
    if (intent === 'request_link') return flag(svc, { application_id: last.id as string });
    return { state: 'approved' };
  }

  // 3) new request (first time, rejected before, or removed before)
  if (intent === 'request_link') return { state: 'listed' }; // nothing to re-send
  let vouchedBy: string | null = null;
  if (input.vouchCode) {
    const { data: voucher } = await svc.from('profiles').select('id').eq('member_code', input.vouchCode).eq('status', 'active').maybeSingle();
    vouchedBy = (voucher?.id as string | undefined) ?? null;
  }
  const { error } = await svc.from('applications').insert({
    name: data.name,
    instagram: displayHandle(data.instagram),
    whatsapp_e164: e164,
    invited_by_instagram: data.invitedBy ? displayHandle(data.invitedBy) : null,
    vouched_by: vouchedBy,
  });
  // two taps at once hit the one-pending-per-number index: that is fine, it is still "on the list"
  if (error && error.code !== '23505') throw new Error(`apply insert failed: ${error.message}`);
  return { state: 'listed' };
}

async function flag(svc: SupabaseClient, subject: { application_id: string } | { profile_id: string }): Promise<ApplyResult> {
  const row: Record<string, string> = { ...subject };
  const { error } = await svc.from('link_requests').insert(row);
  if (error && error.code !== '23505') throw new Error(`link request failed: ${error.message}`);
  return { state: 'link_requested' };
}
