'use server';

import { redirect } from 'next/navigation';
import { demoTarget, isPersona } from '@/lib/demo';
import { ipHash } from '@/lib/request';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { demoEntryAllowed, enterDemo } from '@/server/demo';
import { demoActive } from '@/server/demo-active';

/** one click: become one of the fake demo people (or switch to another). Does nothing unless demo mode is on. */
export async function enterDemoAction(formData: FormData): Promise<void> {
  if (!(await demoActive())) redirect('/login');
  const persona = String(formData.get('persona') ?? '');
  if (!isPersona(persona)) redirect('/demo');
  const next = String(formData.get('next') ?? '');

  let problem: 'busy' | 'failed' | null = null;
  let target = demoTarget(persona, next);
  try {
    const svc = supabaseService();
    if (!(await demoEntryAllowed(svc, await ipHash()))) problem = 'busy';
    else {
      const client = await supabaseServer();
      await enterDemo(svc, client, persona);
      // switching on a plan this person cannot see (a cancelled one she is not in): her own list instead of an error
      const plan = target.match(/^\/plans\/([0-9a-f-]{36})/)?.[1];
      if (plan && !(await client.from('plans').select('id').eq('id', plan).maybeSingle()).data) target = '/plans';
    }
  } catch (e) {
    console.error('demo entry failed:', e instanceof Error ? e.message : 'unknown');
    problem = 'failed';
  }
  if (problem) redirect(`/demo?problem=${problem}`);
  redirect(target);
}
