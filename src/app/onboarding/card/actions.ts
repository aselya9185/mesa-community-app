'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { displayHandle, isValidHandle } from '@/lib/instagram';
import { LIKES } from '@/lib/likes';
import { supabaseServer } from '@/lib/supabase/server';
import { safeNext } from '@/lib/time';

const schema = z.object({
  name: z.string().trim().min(1, 'tell us your name').max(60),
  area: z.string().trim().max(60).optional(),
  instagram: z.string().trim().refine((v) => v === '' || isValidHandle(v), 'that does not look like an instagram handle'),
  trainsAt: z.string().trim().max(300).optional(),
  bio: z.string().trim().max(280).optional(),
});

/** what she submitted, so a form with an error comes back exactly as she left it */
export type CardValues = { name: string; area: string; instagram: string; instagramPublic: boolean; trainsAt: string; likes: string[]; bio: string };
export type CardState = { errors: Partial<Record<'name' | 'instagram', string>>; values: CardValues; attempt: number } | null;

export async function saveCardAction(prev: CardState, formData: FormData): Promise<CardState> {
  const get = (k: string) => String(formData.get(k) ?? '');
  const failed = (errors: NonNullable<CardState>['errors']): CardState => ({
    errors,
    attempt: (prev?.attempt ?? 0) + 1,
    values: {
      name: get('name'),
      area: get('area'),
      instagram: get('instagram'),
      instagramPublic: get('instagramPublic') === 'on',
      trainsAt: get('trainsAt'),
      likes: formData.getAll('likes').map(String),
      bio: get('bio'),
    },
  });
  const parsed = schema.safeParse({ name: get('name'), area: get('area'), instagram: get('instagram'), trainsAt: get('trainsAt'), bio: get('bio') });
  if (!parsed.success) {
    const errors: NonNullable<CardState>['errors'] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (k === 'name' || k === 'instagram') errors[k] = i.message;
    }
    return failed(errors);
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
  // a new photo: only a file she just uploaded into HER folder (the database checks again)
  const uploaded = get('photoPath');
  const ownPhoto = new RegExp(`^${auth.user.id}/avatar-\\d+\\.jpg$`);
  const { data: before } = await supabase.from('profiles').select('photo_path').eq('id', auth.user.id).single();
  const oldPath = (before?.photo_path as string | null) ?? null;
  let photo: { photo_path: string | null } | Record<string, never> = {};
  if (uploaded && ownPhoto.test(uploaded)) photo = { photo_path: uploaded };
  else if (get('photoRemove') === '1') photo = { photo_path: null };

  // row level security: she can only ever update her own card, and only these columns
  const { error } = await supabase
    .from('profiles')
    .update({
      ...photo,
      name: parsed.data.name,
      area: parsed.data.area || null,
      trains_at: trains,
      likes,
      bio: parsed.data.bio || null,
    })
    .eq('id', auth.user.id);
  if (error) return failed({ name: 'could not save your card. try again.' });
  // her handle is private unless she ticks "show on my card"; the same rules apply (she can only write her own row)
  const handle = parsed.data.instagram ? displayHandle(parsed.data.instagram) : null;
  const isPublic = get('instagramPublic') === 'on';
  let igResult: { error: unknown } = { error: null };
  if (!handle) {
    igResult = await supabase.from('member_instagram').delete().eq('user_id', auth.user.id);
  } else {
    // update first; the owner column can never be rewritten (no grant), so a first-time handle is a plain insert
    const upd = await supabase.from('member_instagram').update({ handle, is_public: isPublic }).eq('user_id', auth.user.id).select('user_id');
    igResult = upd.error
      ? upd
      : upd.data?.length
        ? upd
        : await supabase.from('member_instagram').insert({ user_id: auth.user.id, handle, is_public: isPublic });
  }
  if (igResult.error) return failed({ instagram: 'could not save your instagram. try again.' });
  // tidy up the photo she replaced or removed
  if (oldPath && 'photo_path' in photo && photo.photo_path !== oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  redirect(safeNext(get('next')));
}
