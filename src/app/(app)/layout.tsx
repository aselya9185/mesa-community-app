import { AppNav } from '@/components/AppNav';
import { requireMember } from '@/lib/auth';
import styles from './shell.module.css';

// every page in here is members only: requireMember sends visitors to /login and signs removed members out
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return (
    <div className={styles.shell}>
      <AppNav />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
