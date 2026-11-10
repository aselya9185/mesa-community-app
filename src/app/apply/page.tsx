import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ApplyForm } from './ApplyForm';

export const metadata: Metadata = { title: 'request an invite · mesa' };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ v?: string; from?: string }> }) {
  const { v, from } = await searchParams;
  // a vouch code is 12 hex chars; anything else is ignored
  const vouchCode = v && /^[0-9a-f]{12}$/.test(v) ? v : undefined;
  return (
    <AuthShell>
      <ApplyForm vouchCode={vouchCode} fromForgot={from === 'forgot'} />
    </AuthShell>
  );
}
