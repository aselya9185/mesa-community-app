import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { DemoInvite } from '@/components/DemoInvite';
import { ApplyForm } from './ApplyForm';

export const metadata: Metadata = { title: 'request an invite · mesa' };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ v?: string; from?: string }> }) {
  const { v, from } = await searchParams;
  // a vouch code is 12 hex chars; anything else is ignored
  const vouchCode = v && /^[0-9a-f]{12}$/.test(v) ? v : undefined;
  return (
    <AuthShell>
      <DemoInvite note="nothing you type in this form is saved in the demo." />
      <ApplyForm vouchCode={vouchCode} fromForgot={from === 'forgot'} />
    </AuthShell>
  );
}
