import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { safeNext } from '@/lib/time';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'log in · mesa' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
