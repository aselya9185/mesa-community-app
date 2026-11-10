'use server';

import { redirect } from 'next/navigation';
import { loginEmail } from '@/lib/phone';
import { ipHash } from '@/lib/request';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { redeemInvite } from '@/server/join';

export type JoinState = { error: 'weak_password' | 'invalid_link' | 'rate_limited' | 'failed' } | null;

export async function joinAction(token: string, _prev: JoinState, formData: FormData): Promise<JoinState> {
  const password = String(formData.get('password') ?? '');
  const result = await redeemInvite(supabaseService(), token, password, { ipHash: await ipHash() });
  if (!result.ok) return { error: result.error };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(result.phone), password });
  if (error) redirect('/login');
  // a new member makes her card; someone who just reset her password already has one
  redirect(result.purpose === 'invite' ? '/onboarding/card' : '/plans');
}
