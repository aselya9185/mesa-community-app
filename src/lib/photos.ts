import { supabaseServer } from './supabase/server';

/**
 * Photos live in a private bucket. Each page asks for short-lived addresses (one hour) for the people it shows.
 * One batched call per page, never one per face.
 */
export async function signAvatars(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const supabase = await supabaseServer();
  const { data } = await supabase.storage.from('avatars').createSignedUrls(unique, 3600);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

export async function signAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return (await signAvatars([path])).get(path) ?? null;
}
