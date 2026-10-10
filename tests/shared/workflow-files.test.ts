import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { postgresImages, workflowFiles } from './workflow-files';

// #1444 review: GitHub Actions reads both extensions, so every workflow
// contract discovers both, and an image value may be quoted.
const directory = mkdtempSync(join(tmpdir(), 'workflow-files-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('workflowFiles', () => {
  it('finds .yml and .yaml workflows, sorted, and nothing else', () => {
    for (const name of ['b.yaml', 'a.yml', 'notes.md']) {
      writeFileSync(join(directory, name), '');
    }

    expect(workflowFiles(directory)).toEqual([
      join(directory, 'a.yml'),
      join(directory, 'b.yaml'),
    ]);
  });
});

describe('postgresImages', () => {
  it('reads plain, single-quoted and double-quoted image values', () => {
    const text = [
      'image: mirror.gcr.io/library/postgres@sha256:aa # postgres:16',
      "        image: 'postgres:16'",
      '        image: "mirror.gcr.io/library/postgres@sha256:bb"',
      '        image: redis:7',
    ].join('\n');

    expect(postgresImages(text)).toEqual([
      'mirror.gcr.io/library/postgres@sha256:aa',
      'postgres:16',
      'mirror.gcr.io/library/postgres@sha256:bb',
    ]);
  });
});
