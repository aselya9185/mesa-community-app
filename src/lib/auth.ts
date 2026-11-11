import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Me = {
  id: string;
  name: string;
  instagram: string | null;
  area: string | null;
  bio: string | null;
  likes: string[];
  trains_at: string[];
  member_no: number;
  member_code: string;
  photo_path: string | null;
  role: 'member' | 'admin';
};

/** the signed-in, active member, or a redirect to /login. Removed members are signed out. */
export async function requireMember(): Promise<Me> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: me } = await supabase
    .from('profiles')
    .select('id, name, instagram, area, bio, likes, trains_at, member_no, member_code, photo_path, role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (!me) {
    await supabase.auth.signOut();
    redirect('/login');
  }
  return me as Me;
}
