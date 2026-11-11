'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

// Run as the signed-in member: the database enforces who may block or report whom.

export async function blockAction(userId: string) {
  const supabase = await supabaseServer();
  await supabase.rpc('block_member', { p_user: userId });
  revalidatePath('/', 'layout');
}

export async function unblockAction(userId: string) {
  const supabase = await supabaseServer();
  await supabase.rpc('unblock_member', { p_user: userId });
  revalidatePath('/', 'layout');
}

export type ReportState = { status: 'done' } | { status: 'error'; message: string } | null;

const REASONS = ['uncomfortable', 'spam_or_fake', 'no_show', 'other'] as const;
const ERRORS: Record<string, string> = {
  too_many_reports: "you've sent a few reports today. the door list will get to them.",
  member_not_found: "we can't find that member.",
};

export async function reportAction(userId: string, planId: string | null, _prev: ReportState, formData: FormData): Promise<ReportState> {
  const reason = String(formData.get('reason') ?? '');
  if (!(REASONS as readonly string[]).includes(reason)) return { status: 'error', message: 'pick what happened.' };
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('report_member', {
    p_user: userId,
    p_reason: reason,
    p_note: note || null,
    p_plan: planId,
    p_block: formData.get('block') === 'on',
  });
  if (error) return { status: 'error', message: ERRORS[error.message] ?? "couldn't send that. try again." };
  revalidatePath('/', 'layout');
  return { status: 'done' };
}
