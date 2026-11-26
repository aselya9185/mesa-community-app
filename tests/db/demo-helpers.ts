// Switching the demo on in the LOCAL database for a test run, and putting everything back afterwards.
import { serviceClient } from './helpers';

/**
 * The demo refuses to switch on where real members exist (that is the point), and local test data counts as real. So the
 * leftovers are marked as demo for the duration, and unmarked again by demoOff().
 */
export async function demoOn(): Promise<() => Promise<void>> {
  const svc = serviceClient();
  const { data: others } = await svc.from('profiles').select('id').eq('role', 'member').eq('is_demo', false);
  const ids = (others ?? []).map((p) => p.id as string);
  for (let i = 0; i < ids.length; i += 100) await svc.from('profiles').update({ is_demo: true }).in('id', ids.slice(i, i + 100));
  const on = await svc.from('demo_config').update({ enabled: true }).eq('id', 1);
  if (on.error) throw new Error(`could not switch the demo on: ${on.error.message}`);
  return async () => {
    // remove the cast and everything visitors created, then switch off and unmark the leftovers
    const { data: demo } = await svc.from('profiles').select('id, demo_key').eq('is_demo', true);
    for (const p of demo ?? []) if (!ids.includes(p.id as string)) await svc.auth.admin.deleteUser(p.id as string);
    await svc.from('applications').delete().like('whatsapp_e164', '+34600000%');
    await svc.from('demo_secrets').delete().eq('id', 1);
    await svc.from('demo_config').update({ enabled: false }).eq('id', 1);
    for (let i = 0; i < ids.length; i += 100) await svc.from('profiles').update({ is_demo: false }).in('id', ids.slice(i, i + 100));
  };
}
