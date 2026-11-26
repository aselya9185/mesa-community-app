import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { enterDemoAction } from '@/app/demo/actions';
import { PersonaButton } from '@/components/PersonaButton';
import { demoMode } from '@/lib/demo';
import authStyles from '@/components/auth.module.css';
import { requireAdminAnyLevel } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { MfaChallenge, MfaSetup } from './MfaForms';
import styles from './mfa.module.css';

export const metadata: Metadata = { title: 'two-step sign-in · mesa' };

export default async function MfaPage() {
  const me = await requireAdminAnyLevel();
  const supabase = await supabaseServer();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/admin/requests');
  // the demo admin never types a code: entering again completes the step (for example after another visitor reset it)
  if (me.demo_key === 'admin' && demoMode()) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>back to the door</h1>
        <p className={authStyles.sub}>the demo completes the second sign-in step for you.</p>
        <form action={enterDemoAction}>
          <PersonaButton value="admin" className={authStyles.primary}>
            open the door
          </PersonaButton>
        </form>
      </main>
    );
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === 'verified');
  return (
    <main className={styles.page}>
      <p className={authStyles.hint}>door list · only you</p>
      <h1 className={styles.title}>{verified ? 'your code, please' : 'two-step sign-in'}</h1>
      {verified ? (
        <>
          <p className={authStyles.sub}>type the 6-digit code from your authenticator app.</p>
          <MfaChallenge factorId={verified.id} />
        </>
      ) : (
        <MfaSetup />
      )}
    </main>
  );
}
