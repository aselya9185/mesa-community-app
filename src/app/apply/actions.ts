'use server';

import { ipHash } from '@/lib/request';
import { supabaseService } from '@/lib/supabase/service';
import { handleApply, type ApplyIntent, type ApplyResult } from '@/server/apply';

export type ApplyFormState = (ApplyResult & { values: { instagram: string; whatsapp: string; name: string; invitedBy: string } }) | null;

export async function applyAction(_prev: ApplyFormState, formData: FormData): Promise<ApplyFormState> {
  const get = (k: string) => String(formData.get(k) ?? '');
  const values = { name: get('name'), instagram: get('instagram'), whatsapp: get('whatsapp'), invitedBy: get('invitedBy') };
  const intent: ApplyIntent = get('intent') === 'request_link' ? 'request_link' : 'apply';
  const result = await handleApply(
    supabaseService(),
    {
      ...values,
      invitedBy: get('invitedBy'),
      vouchCode: get('vouchCode') || undefined,
      website: get('website'),
      intent,
    },
    { ipHash: await ipHash() },
  );
  return { ...result, values };
}
