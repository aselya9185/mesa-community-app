import { Avatar } from './Avatar';
import styles from './member-card.module.css';

export type CardMember = {
  id: string;
  name: string;
  instagram: string | null;
  area: string | null;
  bio: string | null;
  likes: string[];
  trains_at: string[];
  member_no: number;
};

/** the club card (design B12): no phone number, ever */
export function MemberCard({ m }: { m: CardMember }) {
  return (
    <article className={styles.card}>
      <div className={`${styles.banner} checker`}>
        <span>closed club · bcn</span>
        <span>no. {String(m.member_no).padStart(3, '0')}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.who}>
          <Avatar id={m.id} name={m.name} size={80} />
          <div>
            <h2 className={styles.name}>{m.name.toLowerCase()}</h2>
            <p className={styles.handle}>
              {m.instagram ?? ''}
              {m.instagram && m.area ? ' · ' : ''}
              {m.area?.toLowerCase() ?? ''}
            </p>
          </div>
        </div>
        {m.bio && <p className={styles.bio}>{m.bio}</p>}
        {m.trains_at.length > 0 && (
          <div>
            <h3 className={styles.label}>where i train</h3>
            <ul className={styles.chips}>
              {m.trains_at.map((t) => (
                <li key={t} className={styles.chip}>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
        {m.likes.length > 0 && (
          <div>
            <h3 className={styles.label}>i like</h3>
            <ul className={styles.chips}>
              {m.likes.map((l) => (
                <li key={l} className={`${styles.chip} ${styles.chipOn}`}>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
