'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { displayHandle, isValidHandle } from '@/lib/instagram';
import { LIKES } from '@/lib/likes';
import { supabaseServer } from '@/lib/supabase/server';

const schema = z.object({
  name: z.string().trim().min(1, 'tell us your name').max(60),
  area: z.string().trim().max(60).optional(),
  instagram: z.string().trim().refine((v) => v === '' || isValidHandle(v), 'that does not look like an instagram handle'),
  trainsAt: z.string().trim().max(300).optional(),
  bio: z.string().trim().max(280).optional(),
});

export type CardState = { errors: Partial<Record<'name' | 'instagram', string>> } | null;

export async function saveCardAction(_prev: CardState, formData: FormData): Promise<CardState> {
  const get = (k: string) => String(formData.get(k) ?? '');
  const parsed = schema.safeParse({ name: get('name'), area: get('area'), instagram: get('instagram'), trainsAt: get('trainsAt'), bio: get('bio') });
  if (!parsed.success) {
    const errors: NonNullable<CardState>['errors'] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (k === 'name' || k === 'instagram') errors[k] = i.message;
    }
    return { errors };
  }
  const likes = formData.getAll('likes').map(String).filter((l): l is (typeof LIKES)[number] => (LIKES as readonly string[]).includes(l));
  const trains = (parsed.data.trainsAt ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  // row level security: she can only ever update her own card, and only these columns
  const { error } = await supabase
    .from('profiles')
    .update({
      name: parsed.data.name,
      area: parsed.data.area || null,
      instagram: parsed.data.instagram ? displayHandle(parsed.data.instagram) : null,
      trains_at: trains,
      likes,
      bio: parsed.data.bio || null,
    })
    .eq('id', auth.user.id);
  if (error) return { errors: { name: 'could not save your card. try again.' } };
  redirect('/plans');
}
