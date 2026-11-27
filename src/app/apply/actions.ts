'use server';

import { ipHash } from '@/lib/request';
import { supabaseService } from '@/lib/supabase/service';
import { checkApply, handleApply, type ApplyIntent, type ApplyResult } from '@/server/apply';
import { demoActive } from '@/server/demo-active';

export type ApplyFormState = (ApplyResult & { values: { instagram: string; whatsapp: string; name: string; invitedBy: string } }) | null;

export async function applyAction(_prev: ApplyFormState, formData: FormData): Promise<ApplyFormState> {
  const get = (k: string) => String(formData.get(k) ?? '');
  const values = { name: get('name'), instagram: get('instagram'), whatsapp: get('whatsapp'), invitedBy: get('invitedBy') };
  const intent: ApplyIntent = get('intent') === 'request_link' ? 'request_link' : 'apply';
  const input = { ...values, vouchCode: get('vouchCode') || undefined, website: get('website'), intent };
  // the demo keeps nothing a real person types: check it, show the same screen, store and look up nothing
  if (await demoActive()) {
    const checked = checkApply(input);
    if (!checked.ok) return { state: 'invalid', errors: checked.errors, values };
    return { state: intent === 'request_link' ? 'link_requested' : 'listed', values };
  }
  const result = await handleApply(supabaseService(), input, { ipHash: await ipHash() });
  return { ...result, values };
}
