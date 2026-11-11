'use server';

import { redirect } from 'next/navigation';
import { requireAdminAnyLevel } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';

export type EnrollResult = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };

/** start two-step sign-in: a fresh authenticator secret and its QR code. Nothing counts until she types a valid code. */
export async function startEnrollAction(): Promise<EnrollResult> {
  await requireAdminAnyLevel();
  const supabase = await supabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // an earlier, never-finished attempt would block a new one
  for (const f of factors?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'mesa authenticator' });
  if (error || !data) return { ok: false, error: "couldn't start the setup. try again." };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export type VerifyState = { error: string } | null;

export async function verifyMfaAction(factorId: string, _prev: VerifyState, formData: FormData): Promise<VerifyState> {
  await requireAdminAnyLevel();
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { error: 'the code is 6 digits.' };
  const supabase = await supabaseServer();
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return { error: "couldn't check that code. try again." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) return { error: "that code didn't work. wait for the next one and try again." };
  redirect('/admin/requests');
}
