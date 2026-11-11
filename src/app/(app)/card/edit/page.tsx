import type { Metadata } from 'next';
import { CardForm } from '@/app/onboarding/card/CardForm';
import authStyles from '@/components/auth.module.css';
import { requireMember } from '@/lib/auth';
import { signAvatar } from '@/lib/photos';

export const metadata: Metadata = { title: 'edit your card · mesa' };

export default async function EditCardPage() {
  const me = await requireMember();
  return (
    <div className={authStyles.content} style={{ margin: 0 }}>
      <CardForm me={me} photoUrl={await signAvatar(me.photo_path)} next="/card" heading="edit your card" />
    </div>
  );
}
