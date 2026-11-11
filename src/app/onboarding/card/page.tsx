import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { requireMember } from '@/lib/auth';
import { signAvatar } from '@/lib/photos';
import { CardForm } from './CardForm';

export const metadata: Metadata = { title: 'make your card · mesa' };

export default async function OnboardingCardPage() {
  const me = await requireMember();
  return (
    <AuthShell kicker="you're in">
      <CardForm me={me} photoUrl={await signAvatar(me.photo_path)} />
    </AuthShell>
  );
}
