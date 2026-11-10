import type { Metadata } from 'next';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';
import { Avatar } from '@/components/Avatar';
import { ShareButton } from '@/components/ShareButton';
import { requireMember } from '@/lib/auth';
import styles from './card.module.css';

export const metadata: Metadata = { title: 'your card · mesa' };

export default async function CardPage() {
  const me = await requireMember();
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>your card</h1>
      <article className={styles.card}>
        <div className={`${styles.banner} checker`}>
          <span>closed club · bcn</span>
          <span>no. {String(me.member_no).padStart(3, '0')}</span>
        </div>
        <div className={styles.body}>
          <div className={styles.who}>
            <Avatar id={me.id} name={me.name} size={80} />
            <div>
              <h2 className={styles.name}>{me.name.toLowerCase()}</h2>
              <p className={styles.handle}>
                {me.instagram ?? ''}
                {me.instagram && me.area ? ' · ' : ''}
                {me.area?.toLowerCase() ?? ''}
              </p>
            </div>
          </div>
          {me.bio && <p className={styles.bio}>{me.bio}</p>}
          {me.trains_at.length > 0 && (
            <div>
              <h3 className={styles.label}>where i train</h3>
              <ul className={styles.chips}>
                {me.trains_at.map((t) => (
                  <li key={t} className={styles.chip}>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {me.likes.length > 0 && (
            <div>
              <h3 className={styles.label}>i like</h3>
              <ul className={styles.chips}>
                {me.likes.map((l) => (
                  <li key={l} className={`${styles.chip} ${styles.chipOn}`}>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </article>
      <div className={styles.buttons}>
        <Link href="/card/edit" className={styles.ghost}>
          edit card
        </Link>
        <ShareButton path={`/apply?v=${me.member_code}`} label="invite a friend" title="join me on mesa" />
      </div>
      <p className={styles.hint}>invite a friend copies your link. her request shows &quot;vouched by {me.instagram ?? 'you'}&quot; to the door list. she still needs approval.</p>
      <form action={logoutAction}>
        <button type="submit" className={styles.logout}>
          log out
        </button>
      </form>
    </main>
  );
}
