import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  runFromCommandLine,
  serverActionManifestIssues,
} from './check-server-action-manifest';

// A server action ID is 42 hex characters. Next writes the action's declared
// arguments into its first byte: type bit, six used-argument bits, rest bit.
const id = (infoByte: string) => `${infoByte}${'a'.repeat(40)}`;
const entry = (exportedName: string, filename = 'app/actions.ts') => ({
  workers: {},
  layer: {},
  exportedName,
  filename,
});

describe('serverActionManifestIssues', () => {
  it('accepts actions that declare at most their first argument', () => {
    expect(
      serverActionManifestIssues({
        node: { [id('40')]: entry('save'), [id('00')]: entry('refresh') },
      }),
    ).toEqual([]);
  });

  it("skips 'use cache' functions, which a client cannot call", () => {
    expect(
      serverActionManifestIssues({
        node: { [id('40')]: entry('save'), [id('ff')]: entry('cached') },
      }),
    ).toEqual([]);
  });

  it.each([
    ['a second argument', '60'],
    ['a later argument only', '42'],
    ['a rest parameter', '41'],
    ['every argument', '7f'],
  ])('rejects an action that declares %s', (_case, infoByte) => {
    expect(
      serverActionManifestIssues({
        edge: { [id(infoByte)]: entry('save', 'src/save.ts') },
      }),
    ).toEqual([
      `src/save.ts save declares more than its input (info byte ${infoByte})`,
    ]);
  });

  it('rejects an ID it cannot read', () => {
    expect(
      serverActionManifestIssues({ node: { abc: entry('save') } }),
    ).toEqual(['app/actions.ts save has an unreadable action ID']);
  });

  it('fails closed when it finds no server actions', () => {
    expect(serverActionManifestIssues({ node: {} })).toEqual([
      'the manifest lists no server actions; check that Next has not changed its format',
    ]);
    expect(serverActionManifestIssues(null)).toEqual([
      'the manifest lists no server actions; check that Next has not changed its format',
    ]);
  });
});

describe('runFromCommandLine', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  const withManifest = (manifest: unknown) => {
    root = mkdtempSync(path.join(tmpdir(), 'action-manifest-'));
    mkdirSync(path.join(root, '.next/server'), { recursive: true });
    writeFileSync(
      path.join(root, '.next/server/server-reference-manifest.json'),
      JSON.stringify(manifest),
    );
    return root;
  };

  const output = () => {
    const lines: string[] = [];
    return {
      lines,
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
  };

  it('passes a build whose actions take only their input', () => {
    const out = output();

    expect(
      runFromCommandLine(
        withManifest({ node: { [id('40')]: entry('save') } }),
        out,
      ),
    ).toBe(0);
    expect(out.lines).toEqual(['server actions: 1, all take only their input']);
  });

  it('fails a build with an action that takes more', () => {
    const out = output();

    expect(
      runFromCommandLine(
        withManifest({ node: { [id('60')]: entry('save') } }),
        out,
      ),
    ).toBe(1);
    expect(out.lines).toEqual([
      'app/actions.ts save declares more than its input (info byte 60)',
    ]);
  });

  it('fails when there is no build', () => {
    root = mkdtempSync(path.join(tmpdir(), 'action-manifest-'));
    const out = output();

    expect(runFromCommandLine(root, out)).toBe(1);
    expect(out.lines).toEqual([
      'no .next/server/server-reference-manifest.json: run next build first',
    ]);
  });
});
