import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServer } from './supabase/server';

export type Me = {
  id: string;
  name: string;
  /** her own handle (only she and the admin see it unless she opts in) */
  instagram: string | null;
  /** other members may see her handle */
  instagramPublic: boolean;
  area: string | null;
  bio: string | null;
  likes: string[];
  trains_at: string[];
  member_no: number;
  member_code: string;
  photo_path: string | null;
  role: 'member' | 'admin';
  /** a pretend account that only exists for the demo */
  is_demo: boolean;
  /** which demo person this is ('member', 'host', 'admin', ...), if any */
  demo_key: string | null;
};

/**
 * the signed-in, active member, or a redirect to /login. Removed members are signed out.
 * cache(): the layout and the page both ask, but within one request the database is only asked once.
 */
export const requireMember = cache(async (): Promise<Me> => {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const [{ data: me }, { data: ig }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, area, bio, likes, trains_at, member_no, member_code, photo_path, role, is_demo, demo_key')
      .eq('id', auth.user.id)
      .maybeSingle(),
    supabase.from('member_instagram').select('handle, is_public').eq('user_id', auth.user.id).maybeSingle(),
  ]);
  if (!me) {
    await supabase.auth.signOut();
    redirect('/login');
  }
  return { ...me, instagram: (ig?.handle as string | undefined) ?? null, instagramPublic: (ig?.is_public as boolean | undefined) ?? false } as Me;
});
