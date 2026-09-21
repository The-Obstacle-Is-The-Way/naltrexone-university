import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  auditDocumentation,
  type DocumentationAudit,
  REGISTERS,
  readDocumentation,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

describe('documentation archive convention', () => {
  it('reports a live/archive duplicate even when the live file is a pointer', () => {
    expect(
      audit({
        'docs/debt/debt-001-example.md': '# Archived pointer',
        'docs/_archive/debt/debt-001-example.md': '# Canonical record',
      }).duplicates,
    ).toEqual(['docs/debt/debt-001-example.md']);
  });

  it.each(['Resolved', 'Archived', 'Implemented', 'Closed', 'Complete (MVP)'])(
    'rejects a live record with %s status',
    (status) => {
      expect(
        audit({
          'docs/specs/spec-001-example.md': `# Example\n\n> **Status:** ${status}`,
        }).closedLive,
      ).toEqual(['docs/specs/spec-001-example.md']);
    },
  );

  it('does not confuse active status with a historical resolution in its explanation', () => {
    expect(
      audit({
        'docs/debt/debt-001-example.md':
          '# Example\n\n**Status:** Active — earlier work resolved; tail open.',
      }).closedLive,
    ).toEqual([]);
  });

  it('reports a missing register-row destination', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-missing.md) | Missing |',
      }).missingRowTargets,
    ).toEqual(['docs/bugs/index.md:3 -> docs/bugs/bug-001-missing.md']);
  });

  it('requires a live record to have a table row, not just a narrative mention', () => {
    expect(
      audit({
        'docs/qa/qa-001-example.md': '# Example\n\n**Status:** Draft',
        'docs/qa/index.md': '[QA-001](./qa-001-example.md) was filed.',
      }).missingLiveRows,
    ).toEqual(['docs/qa/qa-001-example.md']);
  });

  it('accepts a real row with a working archived destination', () => {
    expect(
      audit({
        'docs/debt/index.md':
          '| ID | Title |\n| --- | --- |\n| [DEBT-001](../_archive/debt/debt-001-example.md) | Done |',
        'docs/_archive/debt/debt-001-example.md': '# Example',
      }).missingRowTargets,
    ).toEqual([]);
  });

  it('finds inline, image and reference-style file links but not code or site routes', () => {
    const result = audit({
      'docs/guide.md': [
        '[Missing](./missing.md#heading)',
        '![Image](./missing.png)',
        '[Reference][target]',
        '',
        '[target]: <./missing reference.md>',
        '',
        '`[Code](./not-a-link.md)`',
        '```md',
        '[Example](./also-not-a-link.md)',
        '```',
        '[Privacy](/privacy)',
        '[External](https://example.com)',
        '[Anchor](#heading)',
      ].join('\n'),
    });
    expect(result.brokenLive.map((link) => link.url)).toEqual([
      './missing.md#heading',
      './missing.png',
      './missing reference.md',
    ]);
  });

  it('keeps historical unresolvable archive links separate from live failures', () => {
    const result = audit({
      'docs/_archive/bugs/bug-001-example.md': '[Removed](../../../removed.ts)',
    });
    expect(result.brokenLive).toEqual([]);
    expect(result.brokenArchive).toHaveLength(1);
  });
});

describe('documentation archive command', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function fixture(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'documentation-archive-'));
    roots.push(root);
    return root;
  }

  it('fails closed if the documentation walk has no registers', () => {
    expect(() => readDocumentation(fixture())).toThrow(
      'Missing documentation register',
    );
  });

  it('exits nonzero for a broken live link', () => {
    const root = fixture();
    for (const register of Object.keys(REGISTERS)) {
      mkdirSync(path.join(root, 'docs', register), { recursive: true });
      writeFileSync(
        path.join(root, 'docs', register, 'index.md'),
        '# Register',
      );
    }
    writeFileSync(path.join(root, 'README.md'), '[Missing](./missing.md)');
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        path.resolve('scripts/documentation-archive.ts'),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(child.error).toBeUndefined();
    expect(JSON.parse(child.stdout).brokenLive).toHaveLength(1);
    expect(child.status).toBe(1);
  });
});

describe('repository documentation', () => {
  let result: DocumentationAudit;

  beforeAll(() => {
    result = readDocumentation(process.cwd());
  });

  it('has no record in both live and archived folders', () => {
    expect(result.duplicates).toEqual([]);
  });

  it('keeps terminal-status records out of live folders', () => {
    expect(result.closedLive).toEqual([]);
  });

  it('has working register rows for every live record', () => {
    expect(result.missingLiveRows).toEqual([]);
    expect(result.missingRowTargets).toEqual([]);
  });

  it('resolves every relative file link in live documentation', () => {
    expect(result.brokenLive).toEqual([]);
  });
});
