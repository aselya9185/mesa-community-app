import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../src/app/manifest';

describe('the app can be installed', () => {
  const m = manifest();
  it('opens full screen on the plans, in the club colours', () => {
    expect(m).toMatchObject({ name: 'mesa', display: 'standalone', start_url: '/plans', background_color: '#0e0a0f', theme_color: '#0e0a0f' });
  });
  it('has icons for phones, including a maskable one', () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});

describe('the service worker never caches anything private', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  it('only keeps the offline page', () => {
    expect(sw).toContain("OFFLINE_URL = '/offline'");
    expect(sw.match(/cache\.add(All)?\(/g)).toHaveLength(1);
    expect(sw).not.toMatch(/cache\.put\(/);
  });
});

// WCAG 2.1 contrast
function lum(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const BG = { black: '#0E0A0F', surface: '#1A1219', surface2: '#261A24', chat: '#150F14' };

describe('text is readable (WCAG AA, 4.5:1)', () => {
  const cases: [string, string, string][] = [
    ['body text', '#FFF1F7', BG.black],
    ['body text on cards', '#FFF1F7', BG.surface],
    ['body text on bubbles', '#FFF1F7', BG.surface2],
    ['muted text', '#B79AA9', BG.black],
    ['muted text on cards', '#B79AA9', BG.surface],
    ['muted text on chat', '#B79AA9', BG.chat],
    ['muted text on bubbles', '#B79AA9', BG.surface2],
    ['neon pink text', '#FF2E93', BG.black],
    ['neon pink text on cards', '#FF2E93', BG.surface],
    ['soft pink text', '#FF7AB8', BG.black],
    ['soft pink text on cards', '#FF7AB8', BG.surface],
    ['soft pink text on chat', '#FF7AB8', BG.chat],
    ['pale pink text (errors)', '#FFC2DC', BG.black],
    ['pale pink text on cards', '#FFC2DC', BG.surface],
    ['black on pink buttons', BG.black, '#FF2E93'],
    ['black on soft pink', BG.black, '#FF7AB8'],
    ['black on pale pink', BG.black, '#FFC2DC'],
  ];
  it.each(cases)('%s', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the date block text stays readable over the checker (worst square)', () => {
    // white-ish text over the lighter mauve square (the shadow only helps)
    expect(ratio('#FFF1F7', '#A05A79')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#FFF1F7', '#7A1A16')).toBeGreaterThanOrEqual(7);
  });
});
