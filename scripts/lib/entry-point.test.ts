import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isMain } from './entry-point.mts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

function command() {
  const folder = mkdtempSync(path.join(tmpdir(), 'entry-point-'));
  folders.push(folder);
  const file = path.join(folder, 'command.ts');
  writeFileSync(file, '');
  return { folder, file, url: pathToFileURL(file).href };
}

describe('isMain', () => {
  it('is false without an entry path', () => {
    expect(isMain(command().url, '')).toBe(false);
  });

  it('accepts an entry that omits the extension', () => {
    const { folder, url } = command();
    expect(isMain(url, path.join(folder, 'command'))).toBe(true);
  });

  it('is false when no spelling of the entry exists', () => {
    const { folder, url } = command();
    expect(isMain(url, path.join(folder, 'missing'))).toBe(false);
  });

  it('surfaces a filesystem failure other than a missing file', () => {
    const { folder, url } = command();
    const loop = path.join(folder, 'loop');
    symlinkSync(loop, loop);
    expect(() => isMain(url, loop)).toThrow(
      expect.objectContaining({ code: 'ELOOP' }),
    );
  });
});
