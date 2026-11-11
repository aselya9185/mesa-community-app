import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import authStyles from '@/components/auth.module.css';
import { requireAdminAnyLevel } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { MfaChallenge, MfaSetup } from './MfaForms';
import styles from './mfa.module.css';

export const metadata: Metadata = { title: 'two-step sign-in · mesa' };

export default async function MfaPage() {
  await requireAdminAnyLevel();
  const supabase = await supabaseServer();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/admin/requests');
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
