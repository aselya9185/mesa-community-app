'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { madridToUtcISO } from '@/lib/time';

// Everything here runs as the signed-in member. The database decides what is allowed (RLS + RPCs);
// these actions only translate its answers into friendly messages.

export type PlanFormState = { errors: Partial<Record<'title' | 'place' | 'when' | 'maps' | 'booking' | 'form', string>>; values: Record<string, string> } | null;

const url = z.string().trim().refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'paste a full link starting with https://').optional();

const schema = z.object({
  title: z.string().trim().min(1, 'tell us what you are doing').max(80, 'keep it under 80 characters'),
  place: z.string().trim().min(1, 'where is it?').max(120),
  maps: url,
  booking: url,
});

const DB_MESSAGES: Record<string, [keyof NonNullable<PlanFormState>['errors'], string]> = {
  starts_in_past: ['when', 'pick a time that has not happened yet'],
  starts_too_far: ['when', 'plans can be up to 90 days away'],
  too_many_plans: ['form', "that's a lot of plans today. try again tomorrow."],
  not_a_member: ['form', 'you need to be signed in as a member.'],
};

function read(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '');
  return {
    title: get('title'), place: get('place'), maps: get('maps'), booking: get('booking'), date: get('date'), time: get('time'),
    plus: get('plus') === 'on',
    booked: get('booked') === 'yes',
    poll: [...formData.getAll('poll').map(String), get('pollCustom')].map((l) => l.trim()).filter(Boolean),
  };
}

function validate(raw: ReturnType<typeof read>): { ok: true; startsAt: string } | { ok: false; errors: NonNullable<PlanFormState>['errors'] } {
  const errors: NonNullable<PlanFormState>['errors'] = {};
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (k === 'title' || k === 'maps' || k === 'booking') errors[k] = i.message;
      if (k === 'place') errors.place = i.message;
    }
  }
  const startsAt = madridToUtcISO(raw.date, raw.time);
  if (!startsAt) errors.when = 'pick a day and a time';
  if (Object.keys(errors).length > 0 || !startsAt) return { ok: false, errors };
  return { ok: true, startsAt };
}

const echo = (raw: ReturnType<typeof read>): Record<string, string> => ({ title: raw.title, place: raw.place, maps: raw.maps, booking: raw.booking, date: raw.date, time: raw.time, plus: raw.plus ? 'on' : '', booked: raw.booked ? 'yes' : 'no', pollCustom: raw.poll.filter((l) => !['matcha', 'coffee', 'a walk', 'brunch'].includes(l.toLowerCase())).join(', '), poll: raw.poll.join('|') });

export async function createPlanAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const raw = read(formData);
  const v = validate(raw);
  if (!v.ok) return { errors: v.errors, values: echo(raw) };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('create_plan', {
    p_title: raw.title,
    p_starts_at: v.startsAt,
    p_place_name: raw.place,
    p_maps_url: raw.maps || null,
    p_booking_url: raw.booking || null,
    p_free_plus_one: raw.plus,
    p_host_booked: raw.booked && !!raw.booking,
    p_poll: raw.poll,
  });
  if (error || !data) {
    const [field, msg] = DB_MESSAGES[error?.message ?? ''] ?? ['form', 'something went wrong. try again.'];
    return { errors: { [field]: msg }, values: echo(raw) };
  }
  revalidatePath('/plans', 'layout');
  redirect(`/plans/${data}`);
}

export async function updatePlanAction(planId: string, _prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const raw = read(formData);
  const v = validate(raw);
  if (!v.ok) return { errors: v.errors, values: echo(raw) };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('plans')
    .update({ title: raw.title, place_name: raw.place, maps_url: raw.maps || null, booking_url: raw.booking || null, starts_at: v.startsAt, free_plus_one: raw.plus })
    .eq('id', planId)
    .select('id');
  if (error || !data || data.length === 0) {
    const [field, msg] = DB_MESSAGES[error?.message ?? ''] ?? ['form', "you can't edit this plan any more."];
    return { errors: { [field]: msg }, values: echo(raw) };
  }
  revalidatePath('/plans', 'layout');
  redirect(`/plans/${planId}`);
}

async function rpc(name: 'join_plan' | 'leave_plan' | 'cancel_plan', planId: string) {
  const supabase = await supabaseServer();
  await supabase.rpc(name, { p_plan: planId });
  revalidatePath('/plans', 'layout');
}

export async function joinPlanAction(planId: string) {
  await rpc('join_plan', planId);
}

export async function leavePlanAction(planId: string) {
  await rpc('leave_plan', planId);
  redirect('/plans');
}

export async function cancelPlanAction(planId: string) {
  await rpc('cancel_plan', planId);
}

export async function removeFromPlanAction(planId: string, userId: string) {
  const supabase = await supabaseServer();
  await supabase.rpc('remove_from_plan', { p_plan: planId, p_user: userId });
  revalidatePath('/plans', 'layout');
}


// ---- booking, +1, poll ----------------------------------------------------------------

async function run(fn: (s: Awaited<ReturnType<typeof supabaseServer>>) => PromiseLike<{ error: { message: string } | null }>) {
  const supabase = await supabaseServer();
  const { error } = await fn(supabase);
  revalidatePath('/plans', 'layout');
  return error?.message ?? null;
}

export async function setBookingAction(planId: string, booked: boolean) {
  await run((s) => s.rpc('set_booking', { p_plan: planId, p_booked: booked }));
}

export async function assignPlusOneAction(planId: string, userId: string) {
  await run((s) => s.rpc('assign_plus_one', { p_plan: planId, p_user: userId }));
}

export async function revokePlusOneAction(planId: string) {
  await run((s) => s.rpc('revoke_plus_one', { p_plan: planId }));
}

export async function voteAction(planId: string, optionId: string) {
  await run((s) => s.rpc('vote_plan', { p_plan: planId, p_option: optionId }));
}

export async function clearVoteAction(planId: string) {
  await run((s) => s.rpc('clear_vote', { p_plan: planId }));
}

export type AddOptionState = { error: string; value: string } | null;
const OPTION_ERRORS: Record<string, string> = {
  duplicate_option: 'that one is already on the list',
  one_option_each: 'you already added one',
  too_many_options: 'the list is full',
  bad_label: 'keep it between 1 and 30 characters',
};

export async function addOptionAction(planId: string, _prev: AddOptionState, formData: FormData): Promise<AddOptionState> {
  const label = String(formData.get('label') ?? '');
  const err = await run((s) => s.rpc('add_poll_option', { p_plan: planId, p_label: label }));
  if (err) return { error: OPTION_ERRORS[err] ?? 'could not add it. try again.', value: label };
  return null;
}
