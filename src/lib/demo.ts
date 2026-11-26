// Demo mode lets a visitor try the app as a pre-made fake person. It is a server setting, off unless DEMO_MODE=true,
// and the database has its own switch (demo_config) that guards the data. Safe to import anywhere: no secrets here.

export function demoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export const PERSONAS = [
  {
    key: 'member',
    label: 'member 1',
    who: 'marta',
    summary: 'join plans, chat, vote',
    tries: 'open "zumba after work": read the chat, say something, vote for plans after.',
  },
  {
    key: 'host',
    label: 'member 2',
    who: 'anna',
    summary: 'host plans, give the free +1',
    tries: 'open "zumba after work" and give marta the free +1 (or take it back). drop a plan of your own.',
  },
  {
    key: 'admin',
    label: 'admin',
    who: 'laia',
    summary: 'run the door: approve, links, reports',
    tries: 'approve a request and open her one-time link. look at members and reports.',
  },
] as const;

export type PersonaKey = (typeof PERSONAS)[number]['key'];

export function isPersona(value: string): value is PersonaKey {
  return PERSONAS.some((p) => p.key === value);
}

/** where to land after entering or switching: stay on the same page when that person can see it */
export function demoTarget(persona: PersonaKey, next: string | null | undefined): string {
  const safe = !!next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\');
  const path = safe ? next : '';
  const stays = /^\/(plans|chats|card|notifications|members)(\/|\?|$)/.test(path) && !path.startsWith('/card/edit') && !/\/edit(\?|$)/.test(path);
  if (persona === 'admin') return path.startsWith('/admin/') && !path.startsWith('/admin/mfa') ? path : '/admin/requests';
  return stays ? path : '/plans';
}
