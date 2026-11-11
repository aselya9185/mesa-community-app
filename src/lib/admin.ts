import { notFound, redirect } from 'next/navigation';
import { requireMember, type Me } from './auth';
import { supabaseServer } from './supabase/server';

/**
 * The admin area: members who are not the admin get a plain 404 (it does not exist for them);
 * the admin without the MFA step goes to /admin/mfa. The database enforces the same rule (is_admin() needs aal2),
 * this is only the front door.
 */
export async function requireAdmin(): Promise<Me> {
  const me = await requireMember();
  if (me.role !== 'admin') notFound();
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== 'aal2') redirect('/admin/mfa');
  return me;
}

/** the admin, before the MFA step (for the MFA screens themselves) */
export async function requireAdminAnyLevel(): Promise<Me> {
  const me = await requireMember();
  if (me.role !== 'admin') notFound();
  return me;
}
