import { redirect } from 'next/navigation';

// the proxy sends signed-in members to /plans; visitors land on the apply form
export default function Home() {
  redirect('/apply');
}
