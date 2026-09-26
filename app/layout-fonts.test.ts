import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type LocalFontOptions = {
  src: string | { path: string; weight: string }[];
  weight?: string;
  preload?: boolean;
  adjustFontFallback?: false;
  declarations: { prop: string; value: string }[];
};

const localFont = vi.hoisted(() =>
  vi.fn((_options: LocalFontOptions) => ({ className: '', style: {} })),
);

vi.mock('next/font/local', () => ({ default: localFont }));

const appDir = import.meta.dirname;
const globalsCss = readFileSync(join(appDir, 'globals.css'), 'utf8');

function paths(options: LocalFontOptions) {
  return typeof options.src === 'string'
    ? [options.src]
    : options.src.map((file) => file.path);
}

function declared(options: LocalFontOptions, prop: string) {
  return options.declarations.find((declaration) => declaration.prop === prop)
    ?.value;
}

// The contract between the self-hosted faces and globals.css: a family name
// typo, a stray preload or a missing fallback still builds, but renders text
// in the wrong font or shifts layout when the font swaps in.
describe('self-hosted layout fonts', () => {
  let faces: LocalFontOptions[];

  beforeAll(async () => {
    await import('./layout-fonts');
    faces = localFont.mock.calls.map(([options]) => options);
  });

  it('declares exactly the families the globals.css font variables name', () => {
    const variableFamilies = [
      ...globalsCss.matchAll(/--font-[a-z-]+: '([^']+)', '\1 Fallback';/g),
    ].map((match) => match[1]);

    expect(variableFamilies).toEqual([
      'Manrope',
      'Plus Jakarta Sans',
      'Instrument Sans',
    ]);
    expect(new Set(faces.map((face) => declared(face, 'font-family')))).toEqual(
      new Set(variableFamilies),
    );
  });

  it('leaves each fallback to a metric-adjusted face in globals.css', () => {
    for (const family of ['Manrope', 'Plus Jakarta Sans', 'Instrument Sans']) {
      expect(globalsCss).toMatch(
        new RegExp(
          `@font-face \\{\\s*font-family: '${family} Fallback';\\s*src: local\\('Arial'\\);[^}]*size-adjust:`,
        ),
      );
    }
    expect(faces.every((face) => face.adjustFontFallback === false)).toBe(true);
  });

  it('gives body text the metric-adjusted Manrope fallback', () => {
    // #1134 review: a body rule naming "Manrope" directly skipped the
    // fallback face, so text shifted when the font swapped in.
    expect(globalsCss).toMatch(
      /body \{\s*font-family: var\(--font-manrope\), Arial, Helvetica, sans-serif;/,
    );
  });

  it('preloads only the Latin subset of each family', () => {
    const preloaded = faces.filter((face) => face.preload !== false);

    expect(preloaded.map((face) => paths(face)[0])).toEqual([
      './fonts/manrope-latin.woff2',
      './fonts/plus-jakarta-sans-latin.woff2',
      './fonts/instrument-sans-latin.woff2',
    ]);
  });

  it('limits each subset to its unicode range in a file that exists', () => {
    expect(faces).toHaveLength(12);
    for (const face of faces) {
      expect(declared(face, 'unicode-range')).toMatch(/^U\+/);
      for (const path of paths(face)) {
        expect(existsSync(join(appDir, path))).toBe(true);
      }
    }
  });
});
