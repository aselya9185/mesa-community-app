import type { Metadata } from 'next';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';
import { InstallHint } from '@/components/InstallHint';
import { MemberCard } from '@/components/MemberCard';
import { NotificationBell } from '@/components/NotificationBell';
import { ShareButton } from '@/components/ShareButton';
import { requireMember } from '@/lib/auth';
import { signAvatar } from '@/lib/photos';
import { supabaseServer } from '@/lib/supabase/server';
import { unblockAction } from '../members/actions';
import styles from './card.module.css';

export const metadata: Metadata = { title: 'your card · mesa' };

export default async function CardPage() {
  const me = await requireMember();
  const supabase = await supabaseServer();
  const { data: blocks } = await supabase.from('blocks').select('blocked_id, profiles!blocks_blocked_id_fkey(id, name)');
  const blocked = ((blocks ?? []) as unknown as { profiles: { id: string; name: string } | { id: string; name: string }[] | null }[])
    .map((b) => (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles))
    .filter((p): p is { id: string; name: string } => !!p);
  return (
    <main className={styles.page}>
      <div className={styles.headRow}>
        <h1 className={styles.heading}>your card</h1>
        <NotificationBell className={styles.bellMobile} />
      </div>
      <MemberCard m={{ ...me, photo: await signAvatar(me.photo_path) }} />
      <div className={styles.buttons}>
        <Link href="/card/edit" className={styles.ghost}>
          edit card
        </Link>
        <ShareButton path={`/apply?v=${me.member_code}`} label="invite a friend" title="join me on mesa" />
      </div>
      <p className={styles.hint}>invite a friend copies your link. her request shows &quot;vouched by {me.instagram ?? 'you'}&quot; to the door list. she still needs approval.</p>
      {blocked.length > 0 && (
        <section className={styles.blocked} aria-labelledby="blocked-h">
          <h2 id="blocked-h" className={styles.blockedTitle}>
            blocked members
          </h2>
          {blocked.map((b) => (
            <div key={b.id} className={styles.blockedRow}>
              <span>{b.name.toLowerCase()}</span>
              <form action={unblockAction.bind(null, b.id)}>
                <button type="submit" className={styles.unblock} aria-label={`unblock ${b.name.toLowerCase()}`}>
                  unblock
                </button>
              </form>
            </div>
          ))}
        </section>
      )}
      <InstallHint />
      <form action={logoutAction}>
        <button type="submit" className={styles.logout}>
          log out
        </button>
      </form>
    </main>
  );
}
