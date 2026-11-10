// Plans are entered and shown in Barcelona time, stored as UTC.
export const TZ = 'Europe/Madrid';

function parts(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** offset of Madrid from UTC at an instant, in minutes (+60 winter, +120 summer) */
function offsetMinutes(at: Date): number {
  const p = parts(at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-15" + "19:00" typed in Barcelona -> the UTC instant, as an ISO string. Null if it is not a real date/time. */
export function madridToUtcISO(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!d || !t) return null;
  const [y, m, day] = [+d[1]!, +d[2]!, +d[3]!];
  const check = new Date(Date.UTC(y, m - 1, day));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== day) return null;
  const guess = Date.UTC(y, m - 1, day, +t[1]!, +t[2]!);
  // the offset depends on the instant itself: settle it in two passes (handles both DST switches)
  let utc = guess - offsetMinutes(new Date(guess)) * 60000;
  utc = guess - offsetMinutes(new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

/** back into the two form fields: "2026-11-15", "19:00" (Barcelona time) */
export function utcToMadridFields(iso: string): { date: string; time: string } {
  const p = parts(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export type DayParts = { dow: string; day: string; month: string; time: string; long: string };

/** "thu", "15", "oct", "19:00", "thu 15 oct" (lowercase house style) */
export function dayParts(iso: string): DayParts {
  const p = parts(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dow = p.weekday!.toLowerCase();
  const month = p.month!.toLowerCase();
  return { dow, day: p.day!, month, time: `${p.hour}:${p.minute}`, long: `${dow} ${p.day} ${month}` };
}

/** today in Barcelona as YYYY-MM-DD (for the date input's min) */
export function todayMadrid(now: Date = new Date()): string {
  return utcToMadridFields(now.toISOString()).date;
}

/** the feed is "this week": from now to 7 days ahead */
export function feedWindow(now: Date = new Date()): { from: string; to: string } {
  return { from: now.toISOString(), to: new Date(now.getTime() + 7 * 86400_000).toISOString() };
}

/** only same-site paths: used for ?next= after login */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.startsWith('/login')) return '/plans';
  return next;
}
