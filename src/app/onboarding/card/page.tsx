import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { DemoFrame } from '@/components/DemoFrame';
import { requireMember } from '@/lib/auth';
import { signAvatar } from '@/lib/photos';
import { CardForm } from './CardForm';

export const metadata: Metadata = { title: 'make your card · mesa' };

export default async function OnboardingCardPage() {
  const me = await requireMember();
  return (
    <DemoFrame current={me.demo_key}>
      <AuthShell kicker="you're in">
        <CardForm me={me} photoUrl={await signAvatar(me.photo_path)} />
      </AuthShell>
    </DemoFrame>
  );
}
