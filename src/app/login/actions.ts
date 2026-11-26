'use server';

import { redirect } from 'next/navigation';
import { demoMode } from '@/lib/demo';
import { loginEmail, normalizePhone } from '@/lib/phone';
import { ipHash } from '@/lib/request';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { loginAllowed } from '@/server/login';
import { safeNext } from '@/lib/time';

export type LoginState = { error: 'wrong' | 'rate_limited'; whatsapp: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = String(formData.get('whatsapp') ?? '');
  const e164 = normalizePhone(typed);
  const password = String(formData.get('password') ?? '');

  if (!(await loginAllowed(supabaseService(), { ipHash: await ipHash(), e164 }))) return { error: 'rate_limited', whatsapp: typed };
  // one generic answer for "no such number", "wrong password", "removed": nothing to probe
  if (!e164 || !password) return { error: 'wrong', whatsapp: typed };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(e164), password });
  if (error) return { error: 'wrong', whatsapp: typed };
  redirect(safeNext(String(formData.get('next') ?? '')));
}

export async function logoutAction() {
  const supabase = await supabaseServer();
  if (demoMode()) {
    // many visitors share each demo person: sign out this device only
    await supabase.auth.signOut({ scope: 'local' });
    redirect('/demo');
  }
  await supabase.auth.signOut();
  redirect('/login');
}
