import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readServerActionNames } from './server-actions';

describe('readServerActionNames', () => {
  const directories: string[] = [];
  const manifestPath = (contents: string) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'server-actions-'));
    directories.push(directory);
    const file = path.join(directory, 'server-reference-manifest.json');
    writeFileSync(file, contents);
    return file;
  };

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { force: true, recursive: true });
  });

  it("names each action ID by its export in the build's manifest", () => {
    const names = readServerActionNames(
      manifestPath(
        JSON.stringify({
          node: {
            'timing-action-id': { exportedName: 'getPracticeSessionTiming' },
            'unnamed-action-id': {},
          },
        }),
      ),
    );

    expect(names.get('timing-action-id')).toBe('getPracticeSessionTiming');
    expect(names.has('unnamed-action-id')).toBe(false);
  });

  it.each([
    ['truncated JSON', '{"node": {'],
    ['a null manifest', 'null'],
    ['a node that is not an object', '{"node": 3}'],
  ])('returns no names, without throwing, for %s', (_label, contents) => {
    expect(readServerActionNames(manifestPath(contents)).size).toBe(0);
  });

  it('keeps only entries whose export name is a non-empty string', () => {
    const names = readServerActionNames(
      manifestPath(
        JSON.stringify({
          node: {
            'null-entry-id': null,
            'numeric-name-id': { exportedName: 7 },
            'empty-name-id': { exportedName: '' },
            'timing-action-id': { exportedName: 'getPracticeSessionTiming' },
          },
        }),
      ),
    );

    expect([...names.entries()]).toEqual([
      ['timing-action-id', 'getPracticeSessionTiming'],
    ]);
  });

  it('returns no names without a build', () => {
    expect(
      readServerActionNames(path.join(tmpdir(), 'no-such-build.json')).size,
    ).toBe(0);
  });
});
