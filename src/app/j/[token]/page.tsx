import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { DemoFrame } from '@/components/DemoFrame';
import styles from '@/components/auth.module.css';
import { supabaseService } from '@/lib/supabase/service';
import { previewInvite } from '@/server/join';
import { JoinForm } from './JoinForm';

// Link previews (WhatsApp, Instagram) fetch this page too. Nothing here consumes the token.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "you're invited to mesa",
    description: 'a closed girls club in barcelona. tap to get in.',
    robots: { index: false, follow: false },
    openGraph: { title: "you're invited to mesa", description: 'a closed girls club in barcelona. tap to get in.', type: 'website' },
  };
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvite(supabaseService(), token);
  return (
    // no person is highlighted: whoever opens an invite is someone new
    <DemoFrame current={null}>
      <AuthShell>
        {preview.ok ? (
          <JoinForm token={token} firstName={preview.firstName} purpose={preview.purpose} />
        ) : (
          <>
            <h1 className={styles.title}>this link is done</h1>
            <p className={styles.sub} role="status">
              this link has already been used or has expired. ask the club for a new one.
            </p>
            <Link href="/apply?from=forgot" className={styles.primary}>
              ask for a new link
            </Link>
          </>
        )}
      </AuthShell>
    </DemoFrame>
  );
}
