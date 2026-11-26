// Local development seed: `npm run seed` (needs `npx supabase start`).
// Creates an admin, a few members and a few applications. Passwords are dev-only.
import { service, upsertMember } from './lib.mjs';

const svc = service({ localOnly: true });
const password = 'mesa-dev-password';

const people = [
  { phone: '+34600000001', name: 'Laia', instagram: '@laia.moves', instagramPublic: true, role: 'admin', area: 'Poblenou', likes: ['zumba', 'strength', 'running'], trains_at: ['Studio Poblenou', 'Gym Gràcia'], bio: 'class collector. matcha after, always.' },
  { phone: '+34600000002', name: 'Marta', instagram: '@marta.matcha', instagramPublic: true, area: 'Gràcia', likes: ['pilates', 'yoga'], trains_at: ['Studio Poblenou'] },
  { phone: '+34600000003', name: 'Anna', instagram: '@anna.runs', instagramPublic: true, area: 'Eixample', likes: ['running'], trains_at: [] },
  { phone: '+34600000004', name: 'Carla', instagram: '@carla.cafe', instagramPublic: true, area: 'Born', likes: ['zumba'], trains_at: [] },
];

for (const p of people) {
  const id = await upsertMember(svc, { ...p, password });
  console.log(`${p.role ?? 'member'} ${p.name} ${p.phone} ${id}`);
}

const apps = [
  { name: 'Nuria', instagram: '@nuria.runs', whatsapp_e164: '+34600111222' },
  { name: 'Julia', instagram: '@julia.pilates', whatsapp_e164: '+34600333444' },
  { name: 'Mireia', instagram: '@mireia.yoga', whatsapp_e164: '+34600555666' },
];
for (const a of apps) {
  const { error } = await svc.from('applications').insert(a);
  if (error && error.code !== '23505') throw error; // 23505: already seeded
}
console.log(`\nlog in with any number above and password "${password}".`);
console.log('the admin needs TOTP enrolled to use the door list.');
