import { describe, expect, it } from 'vitest';
import { dayParts, feedWindow, madridToUtcISO, safeNext, todayMadrid, utcToMadridFields } from '../src/lib/time';

describe('Barcelona time', () => {
  it('winter is UTC+1', () => {
    expect(madridToUtcISO('2026-11-15', '19:00')).toBe('2026-11-15T18:00:00.000Z');
  });
  it('summer is UTC+2', () => {
    expect(madridToUtcISO('2026-07-15', '19:00')).toBe('2026-07-15T17:00:00.000Z');
  });
  it('handles the day the clocks go forward (29 march 2026) and back (25 october 2026)', () => {
    expect(madridToUtcISO('2026-03-29', '01:30')).toBe('2026-03-29T00:30:00.000Z'); // still +1
    expect(madridToUtcISO('2026-03-29', '04:00')).toBe('2026-03-29T02:00:00.000Z'); // now +2
    expect(madridToUtcISO('2026-10-25', '01:30')).toBe('2026-10-24T23:30:00.000Z'); // still +2
    expect(madridToUtcISO('2026-10-25', '04:00')).toBe('2026-10-25T03:00:00.000Z'); // now +1
  });
  it('round-trips through the form fields', () => {
    for (const [d, t] of [['2026-11-15', '19:00'], ['2026-07-01', '08:30'], ['2026-12-31', '23:59']] as const) {
      expect(utcToMadridFields(madridToUtcISO(d, t)!)).toEqual({ date: d, time: t });
    }
  });
  it('rejects impossible dates and times', () => {
    expect(madridToUtcISO('2026-02-30', '10:00')).toBeNull();
    expect(madridToUtcISO('2026-11-15', '25:00')).toBeNull();
    expect(madridToUtcISO('15/11/2026', '19:00')).toBeNull();
    expect(madridToUtcISO('', '')).toBeNull();
  });
  it('formats in lowercase house style', () => {
    expect(dayParts('2026-10-15T17:00:00.000Z')).toEqual({ dow: 'thu', day: '15', month: 'oct', time: '19:00', long: 'thu 15 oct' });
  });
  it('knows today in Barcelona even just after midnight there', () => {
    expect(todayMadrid(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16');
  });
  it('the feed covers exactly the next 7 days', () => {
    const w = feedWindow(new Date('2026-11-10T10:00:00Z'));
    expect(w).toEqual({ from: '2026-11-10T10:00:00.000Z', to: '2026-11-17T10:00:00.000Z' });
  });
});

describe('safe redirects after login', () => {
  it.each([
    ['/plans/abc', '/plans/abc'],
    ['/plans?x=1', '/plans?x=1'],
    ['//evil.com', '/plans'],
    ['https://evil.com', '/plans'],
    ['/\\evil.com', '/plans'],
    ['/login', '/plans'],
    ['', '/plans'],
    [null, '/plans'],
  ])('%s -> %s', (input, expected) => {
    expect(safeNext(input as string | null)).toBe(expected);
  });
});
