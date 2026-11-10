import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'log in · mesa' };

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
