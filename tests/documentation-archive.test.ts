import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  auditDocumentation,
  auditRecordLifecycle,
  brokenDocumentationLinks,
  type DocumentationAudit,
  REGISTERS,
  readDocumentation,
  readDocumentationFiles,
  runDocumentationCommand,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

function runArchiveCommand(root: string) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      path.resolve('scripts/documentation-archive.ts'),
    ],
    { cwd: root, encoding: 'utf8', timeout: 14_000 },
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

  it('detects the same numbered record after its title changes', () => {
    expect(
      audit({
        'docs/debt/debt-001-old-title.md': '# Active copy',
        'docs/_archive/debt/debt-001-new-title.md': '# Archived copy',
        'docs/debt/fe-001-unrelated.md': '# Different record',
      }).duplicates,
    ).toEqual(['docs/debt/debt-001-old-title.md']);
  });

  it('does not accept an extra parent segment just because a file exists outside the repository', () => {
    expect(
      audit({
        'docs/guide.md': '[Outside](../../outside.md)',
        '../outside.md': '# Not published with this repository',
      }).brokenLive.map((link) => link.target),
    ).toEqual(['../outside.md']);
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

  it('keeps a proposed record open when its explanation says it is not implemented', () => {
    expect(
      audit({
        'docs/specs/spec-001-example.md':
          '# Example\n\n**Status:** Proposed — not implemented',
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

  it("does not count another record's related-link cell as the live record's own row", () => {
    expect(
      audit({
        'docs/brainstorming/bs-044-open.md': '# Open\n\n**Status:** Active',
        'docs/_archive/brainstorming/bs-042-closed.md': '# Closed',
        'docs/brainstorming/index.md':
          '## Archived\n\n| ID | Notes |\n| --- | --- |\n| [BS-042](../_archive/brainstorming/bs-042-closed.md) | Residual [BS-044](./bs-044-open.md) |',
      }).missingLiveRows,
    ).toEqual(['docs/brainstorming/bs-044-open.md']);
  });

  it('accepts a record row with a plain ID and its file linked in the title column', () => {
    expect(
      audit({
        'docs/audits/audit-001-open.md': '# Open\n\n**Status:** Active',
        'docs/audits/index.md':
          '| ID | Title |\n| --- | --- |\n| AUDIT-001 | [Audit](./audit-001-open.md) |',
      }).missingLiveRows,
    ).toEqual([]);
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
    // Cover the same command body with real files and captured reporting.
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (report) => reports.push(report)),
    ).toBe(1);
    expect(reports[0]?.brokenLive).toHaveLength(1);
    writeFileSync(path.join(root, 'missing.md'), '# Repaired');
    expect(
      runDocumentationCommand(root, (report) => reports.push(report)),
    ).toBe(0);
    expect(reports[1]?.brokenLive).toEqual([]);
    writeFileSync(
      path.join(root, 'README.md'),
      '[Missing](./another-missing.md)',
    );
    const child = runArchiveCommand(root);
    expect(child.error).toBeUndefined();
    expect(JSON.parse(child.stdout).brokenLive).toHaveLength(1);
    expect(child.status).toBe(1);
  });
});

describe('repository documentation', () => {
  const files = readDocumentationFiles(process.cwd());
  const exists = (file: string) => existsSync(path.resolve(file));
  let result: DocumentationAudit;

  beforeAll(() => {
    // Lifecycle needs all record names/statuses, but only the six index ASTs.
    result = auditRecordLifecycle(files, exists);
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

  it.each(
    [...files.keys()].filter((file) => !file.startsWith('docs/_archive/')),
  )('resolves relative file links in %s', (file) => {
    expect(
      brokenDocumentationLinks(file, files.get(file) ?? '', exists),
    ).toEqual([]);
  });
});
