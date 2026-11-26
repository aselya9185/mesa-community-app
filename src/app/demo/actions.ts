'use server';

import { redirect } from 'next/navigation';
import { demoMode, demoTarget, isPersona } from '@/lib/demo';
import { ipHash } from '@/lib/request';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { demoEntryAllowed, enterDemo } from '@/server/demo';

/** one click: become one of the fake demo people (or switch to another). Does nothing unless demo mode is on. */
export async function enterDemoAction(formData: FormData): Promise<void> {
  if (!demoMode()) redirect('/login');
  const persona = String(formData.get('persona') ?? '');
  if (!isPersona(persona)) redirect('/demo');
  const next = String(formData.get('next') ?? '');

  let problem: 'busy' | 'failed' | null = null;
  try {
    const svc = supabaseService();
    if (!(await demoEntryAllowed(svc, await ipHash()))) problem = 'busy';
    else await enterDemo(svc, await supabaseServer(), persona);
  } catch (e) {
    console.error('demo entry failed:', e instanceof Error ? e.message : 'unknown');
    problem = 'failed';
  }
  if (problem) redirect(`/demo?problem=${problem}`);
  redirect(demoTarget(persona, next));
}
