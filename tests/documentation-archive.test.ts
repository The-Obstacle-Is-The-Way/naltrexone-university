import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  RECORDS,
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
          'docs/records/bug-001-example.md': `# Example\n\n> **Status:** ${status}`,
        }).closedLive,
      ).toEqual(['docs/records/bug-001-example.md']);
    },
  );

  it('does not confuse active status with a historical resolution in its explanation', () => {
    expect(
      audit({
        'docs/records/debt-001-example.md':
          '# Example\n\n**Status:** Active — earlier work resolved; tail open.',
      }).closedLive,
    ).toEqual([]);
  });

  it('keeps a proposed record open when its explanation says it is not implemented', () => {
    expect(
      audit({
        'docs/records/debt-001-example.md':
          '# Example\n\n**Status:** Proposed — not implemented',
      }).closedLive,
    ).toEqual([]);
  });

  it.each([
    '**Status:** ✅ RESOLVED 2026-06-11 — shipped',
    '> **Status:** ✅ **Resolved**',
    '**Resolution State:** Fixed in PR #289',
    '**Status:** Completed',
    '**Status:** Fully Addressed',
  ])('rejects a live record with the existing metadata form %s', (metadata) => {
    expect(
      audit({ 'docs/records/debt-001-example.md': metadata }).closedLive,
    ).toEqual(['docs/records/debt-001-example.md']);
  });

  it('uses the current status rather than a later historical field', () => {
    expect(
      audit({
        'docs/records/debt-001-example.md':
          '**Status:** Open — earlier slice resolved\n\n**Resolution State:** Fixed previously',
      }).closedLive,
    ).toEqual([]);
  });

  // Every form a CommonMark code block can take, so the audit's fast path
  // for code-free metadata cannot skip one.
  it.each([
    ['a tilde fence', '~~~md\n**Status:** Resolved\n~~~'],
    ['an indented block', 'Intro.\n\n    **Status:** Resolved'],
    ['a tab-indented block', 'Intro.\n\n\t**Status:** Resolved'],
    ['an indented block inside a block quote', '>     **Status:** Resolved'],
  ])('fails closed when the first status field is %s', (_form, example) => {
    const file = 'docs/records/debt-001-example.md';
    expect(() => audit({ [file]: `${example}\n\n**Status:** Open` })).toThrow(
      `Status metadata inside a code example: ${file}`,
    );
  });

  it('fails closed when the first status field is a fenced example', () => {
    const file = 'docs/records/debt-001-example.md';
    expect(() =>
      audit({
        [file]: '```md\n**Status:** Resolved\n```\n\n**Status:** Open',
      }),
    ).toThrow(
      `Status metadata inside a code example: ${file}; put the record disposition before examples`,
    );
  });

  it('reads the status after an unrelated code block', () => {
    const file = 'docs/records/debt-001-example.md';
    expect(
      audit({
        [file]: '```ts\nconst example = true;\n```\n\n**Status:** Resolved',
      }).closedLive,
    ).toEqual([file]);
  });

  it('reports a missing register-row destination', () => {
    expect(
      audit({
        'docs/records/README.md':
          '| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-missing.md) | Missing |',
      }).missingRowTargets,
    ).toEqual(['docs/records/README.md:3 -> docs/records/bug-001-missing.md']);
  });

  it('requires a live record to have a table row, not just a narrative mention', () => {
    expect(
      audit({
        'docs/records/debt-001-example.md': '# Example\n\n**Status:** Open',
        'docs/records/README.md':
          '[DEBT-001](./debt-001-example.md) was filed.',
      }).missingLiveRows,
    ).toEqual(['docs/records/debt-001-example.md']);
  });

  it("does not count another record's related-link cell as the live record's own row", () => {
    expect(
      audit({
        'docs/records/debt-044-open.md': '# Open\n\n**Status:** Open',
        'docs/records/debt-042-open.md': '# Open\n\n**Status:** Open',
        'docs/records/README.md':
          '## Waiting\n\n| ID | Notes |\n| --- | --- |\n| [DEBT-042](./debt-042-open.md) | Residual [DEBT-044](./debt-044-open.md) |',
      }).missingLiveRows,
    ).toEqual(['docs/records/debt-044-open.md']);
  });

  it('accepts a record row with a plain ID and its file linked in the title column', () => {
    expect(
      audit({
        'docs/records/debt-001-open.md': '# Open\n\n**Status:** Open',
        'docs/records/README.md':
          '| ID | Title |\n| --- | --- |\n| DEBT-001 | [Debt](./debt-001-open.md) |',
      }).missingLiveRows,
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

  it.each(['<a href="./missing.md">Missing</a>', '<img src="./missing.png">'])(
    'rejects unsupported raw HTML link attributes: %s',
    (html) => {
      expect(() => audit({ 'docs/guide.md': html })).toThrow(
        'Unsupported HTML link attributes: docs/guide.md:1; use Markdown links or images',
      );
    },
  );

  it('reports malformed percent encoding even when a raw-path file exists', () => {
    const file = 'docs/guide.md';
    const result = audit({
      [file]: '[Malformed](./assets/100%.png)',
      'docs/assets/100%.png': 'asset',
    });
    expect(result.brokenLive).toEqual([
      expect.objectContaining({
        file,
        url: './assets/100%.png',
        invalidEncoding: true,
      }),
    ]);
  });

  it('reports malformed encoding in a register row instead of crashing', () => {
    expect(
      audit({
        'docs/records/README.md':
          '| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-100%.md) | Malformed |',
        'docs/records/bug-001-100%.md': '# Open record',
      }).missingRowTargets,
    ).toEqual(['docs/records/README.md:3 -> docs/records/bug-001-100%.md']);
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

  // A records index names its weekly queue review on one line.
  const QUEUE_REVIEW = '**Queue review due:** 2026-10-19\n\n';
  const withQueueReview = (index: string) =>
    index.includes('**Queue review due:**') ? index : `${QUEUE_REVIEW}${index}`;

  function populate(root: string, files: Record<string, string>): void {
    files[RECORDS.index] = withQueueReview(
      files[RECORDS.index] ?? '# Records\n\n**Now** — fixture',
    );
    files[RECORDS.ledger] ??= '# Closed records';
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
  }

  it.each([
    [
      'closed live',
      'docs/records/debt-001-example.md',
      '**Status:** ✅ RESOLVED',
      '**Status:** Open',
    ],
    [
      'duplicate Now',
      'docs/records/README.md',
      '**Now** — A\n\n**Now** — B',
      '**Now** — A',
    ],
    ['missing Now', 'docs/records/README.md', '# Records', '**Now** — current'],
    [
      'a Latest changelog',
      'docs/records/README.md',
      '**Now** — A\n\n**Latest** — B',
      '**Now** — A',
    ],
    [
      'a Verifying record without a due date',
      'docs/records/debt-001-example.md',
      '**Status:** Verifying — production check',
      '**Status:** Verifying — production check; due 2026-10-19',
    ],
    [
      'a long status',
      'docs/records/debt-001-example.md',
      `**Status:** Open — ${'x'.repeat(200)}`,
      '**Status:** Open — short',
    ],
    [
      'a branch URL into the deleted archive',
      'docs/guides/example.md',
      '[Branch](https://github.com/o/r/blob/dev/docs/_archive/bugs/bug-001-x.md)',
      `[Pinned](https://github.com/o/r/blob/${'a'.repeat(40)}/docs/_archive/bugs/bug-001-x.md)`,
    ],
  ])(
    'fails the command solely for %s and passes after correction',
    (_kind, file, before, after) => {
      const root = fixture();
      const files: Record<string, string> = { [file]: before };
      if (file !== RECORDS.index) {
        files[RECORDS.index] =
          `**Now** — fixture, naming DEBT-001\n\n| ID | Title |\n| --- | --- |\n| [DEBT-001](${path.posix.relative('docs/records', file)}) | Example |`;
      }
      populate(root, files);
      const reports: DocumentationAudit[] = [];
      expect(
        runDocumentationCommand(root, (json) => reports.push(JSON.parse(json))),
      ).toBe(1);
      expect(reports[0]).toMatchObject({
        duplicates: [],
        missingLiveRows: [],
        missingRowTargets: [],
        brokenLive: [],
      });
      writeFileSync(
        path.join(root, file),
        file === RECORDS.index ? withQueueReview(after) : after,
      );
      expect(runDocumentationCommand(root, () => {})).toBe(0);
    },
  );

  it('exits nonzero with a diagnostic for ambiguous fenced status metadata', () => {
    const root = fixture();
    populate(root, {
      'docs/records/debt-001-example.md':
        '```md\n**Status:** Resolved\n```\n\n**Status:** Open',
    });
    const child = runArchiveCommand(root);
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain(
      'Status metadata inside a code example: docs/records/debt-001-example.md',
    );
  });

  it('reports malformed encoding as a failing CLI result without a crash or rewrite', () => {
    const root = fixture();
    const file = 'docs/guide.md';
    const original = '[Malformed](./assets/100%.png)';
    populate(root, { [file]: original });
    const child = runArchiveCommand(root);
    expect(child.error).toBeUndefined();
    expect(child.stderr).toBe('');
    expect(child.status).toBe(1);
    expect(JSON.parse(child.stdout).brokenLive).toEqual([
      expect.objectContaining({
        url: './assets/100%.png',
        invalidEncoding: true,
      }),
    ]);
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
  });

  it('fails closed if the documentation walk has no records index or ledger', () => {
    expect(() => readDocumentation(fixture())).toThrow(
      'Missing documentation records',
    );
  });

  it('exits nonzero for a broken live link', () => {
    const root = fixture();
    populate(root, {});
    writeFileSync(path.join(root, 'README.md'), '[Missing](./missing.md)');
    // Cover the same command body with real files and captured reporting.
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (report) =>
        reports.push(JSON.parse(report)),
      ),
    ).toBe(1);
    expect(reports[0]?.brokenLive).toHaveLength(1);
    writeFileSync(path.join(root, 'missing.md'), '# Repaired');
    expect(
      runDocumentationCommand(root, (report) =>
        reports.push(JSON.parse(report)),
      ),
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

  // Lifecycle reads every record's status, but parses only the index.
  beforeAll(() => {
    result = auditRecordLifecycle(files, exists);
  });

  it('lists no record ID twice across open records and the ledger', () => {
    expect(result.duplicates).toEqual([]);
  });

  it('keeps terminal-status records out of live folders', () => {
    expect(result.closedLive).toEqual([]);
  });

  it('has working register rows for every live record', () => {
    expect(result.missingLiveRows).toEqual([]);
    expect(result.missingRowTargets).toEqual([]);
  });

  it('keeps one Now stanza and no Latest changelog in each index', () => {
    expect(result).toMatchObject({ invalidNow: [] });
  });

  it('keeps only open records, the index and the ledger in docs/records', () => {
    expect(result.strayRegisterFiles).toEqual([]);
  });

  it('names every Verifying record in its index Now stanza', () => {
    expect(result.unnamedVerifying).toEqual([]);
  });

  it('gives every Verifying record a due date', () => {
    expect(result.invalidScheduledChecks).toEqual([]);
  });

  it('keeps every live record status to one line', () => {
    expect(result.longStatus).toEqual([]);
  });

  it('keeps the records index within its size budget', () => {
    expect(result.oversized).toEqual([]);
  });

  it.each([...files.keys()])('resolves relative file links in %s', (file) => {
    expect(
      brokenDocumentationLinks(file, files.get(file) ?? '', exists),
    ).toEqual([]);
  });
});
