import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { workflowFiles, workflowImages } from './workflow-files';

// #1444 review: GitHub Actions reads both extensions, so every workflow
// contract discovers both.
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

describe('workflowImages', () => {
  it('reads service images, job containers in both forms, and docker:// steps', () => {
    const text = `
jobs:
  services-job:
    services:
      db:
        image: 'postgres:16'
      cache:
        image: "redis@sha256:aa"
    steps:
      - uses: docker://alpine:3.20
      - uses: actions/checkout@0000000000000000000000000000000000000000
      - run: echo docker://not-a-step-image
  string-container:
    container: node:24
  object-container:
    container:
      image: node@sha256:bb
  reusable:
    uses: ./.github/workflows/other.yml
`;

    expect(workflowImages(text)).toEqual([
      'postgres:16',
      'redis@sha256:aa',
      'alpine:3.20',
      'node:24',
      'node@sha256:bb',
    ]);
  });

  it('reads nothing from a workflow without jobs', () => {
    expect(workflowImages('name: empty\n')).toEqual([]);
  });
});
