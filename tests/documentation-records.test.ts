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
  type DocumentationAudit,
  RECORDS,
  readDocumentationFiles,
  recordLinks,
  runDocumentationCommand,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

// Open bug and debt records live in docs/records/, with one index; a closed
// record is deleted and leaves a line in the ledger (DEBT-518, ADR-023).
describe('records folder and ledger', () => {
  it('reports two open records with the same ID', () => {
    expect(
      audit({
        'docs/records/debt-519-first.md': '# One branch',
        'docs/records/debt-519-second.md': '# Another branch',
      }).duplicates,
    ).toEqual(['docs/records/debt-519-second.md']);
  });

  it('reports a live record whose ID is already in the closed ledger', () => {
    expect(
      audit({
        'docs/records/bug-002-example.md': '# Reopened by mistake',
        'docs/records/closed.md':
          '## Bugs\n\n- BUG-002 · Example · Resolved · 2026-10-01 · #1 · docs/_archive/bugs/bug-002-example.md',
      }).duplicates,
    ).toEqual(['docs/records/bug-002-example.md']);
  });

  it('reports an ID listed twice in the closed ledger', () => {
    expect(
      audit({
        'docs/records/closed.md':
          '## Debt\n\n- DEBT-007 · One · Resolved · 2026-10-01 · #1 · a.md\n- DEBT-008 · Two · Resolved · 2026-10-01 · #2 · b.md\n- DEBT-007 · Again · Resolved · 2026-10-02 · #3 · c.md',
      }).duplicateLedgerIds,
    ).toEqual(['DEBT-007']);
  });

  it('allows only the three ID collisions made before IDs were checked', () => {
    expect(
      audit({
        'docs/records/closed.md':
          '- SPEC-028 · One · Implemented · 2026-03-01 · a.md\n- SPEC-028 · Two · Implemented · 2026-03-02 · b.md',
      }).duplicateLedgerIds,
    ).toEqual([]);
  });

  it.each([
    'docs/debt/index.md',
    'docs/bugs/bug-003-example.md',
    'docs/specs/index.md',
    'docs/specs/master_spec.md',
    'docs/brainstorming/bs-001-example.md',
    'docs/audits/audit-001-example.md',
    'docs/qa/qa-001-example.md',
  ])(
    'reports %s, left in a register folder that docs/records replaced',
    (file) => {
      expect(audit({ [file]: '# Left behind' }).retiredRegisterFiles).toEqual([
        file,
      ]);
    },
  );

  it('reports a link into a record from anywhere but the index', () => {
    const files = {
      'docs/records/README.md':
        '| [DEBT-001](./debt-001-example.md) | Example |',
      'docs/records/debt-001-example.md': '**Status:** Open',
      'docs/records/bug-002-example.md':
        'See [DEBT-001](./debt-001-example.md).',
      'docs/dev/guide.md':
        'See [the record](../records/debt-001-example.md#why).',
      'docs/legal/privacy-policy.md':
        'Evidence: [DEBT-001](../records/debt-001-example.md).',
      'docs/_archive/debt/debt-000-old.md':
        '[DEBT-001](../../records/debt-001-example.md)',
    };
    expect(
      Object.entries(files).flatMap(([file, contents]) =>
        recordLinks(file, contents).map((link) => `${link.file}:${link.url}`),
      ),
    ).toEqual([
      'docs/records/bug-002-example.md:./debt-001-example.md',
      'docs/dev/guide.md:../records/debt-001-example.md#why',
      'docs/legal/privacy-policy.md:../records/debt-001-example.md',
    ]);
    expect(audit(files).recordLinks).toHaveLength(3);
  });

  it('keeps only records, the index and the ledger directly in docs/records', () => {
    expect(
      audit({
        'docs/records/README.md': '**Now** — current',
        'docs/records/closed.md': '# Closed',
        'docs/records/debt-001-example.md': '**Status:** Open',
        'docs/records/notes.md': '# Stray',
        'docs/records/assets/debt-414/receipt.md': '# Legacy asset',
      }).strayRegisterFiles,
    ).toEqual(['docs/records/notes.md']);
  });
  it('reports an absolute link to a record unless it pins a commit', () => {
    const pinned =
      'https://github.com/o/r/blob/0123456789abcdef0123456789abcdef01234567/docs/records/bug-001-x.md';
    const contents = [
      '[branch](https://github.com/o/r/blob/dev/docs/records/bug-001-x.md)',
      '[site](/docs/records/debt-002-y.md#why)',
      `[pinned](${pinned})`,
    ].join('\n\n');
    expect(
      recordLinks('docs/dev/guide.md', contents).map((link) => link.url),
    ).toEqual([
      'https://github.com/o/r/blob/dev/docs/records/bug-001-x.md',
      '/docs/records/debt-002-y.md#why',
    ]);
  });

  it.each([
    'docs/debt/notes.md',
    'docs/bugs/register-history-2026-11.md',
    'docs/qa/README.md',
    'docs/brainstorming/notes.md',
    'docs/audits/notes.md',
  ])('reports %s, any Markdown left in a retired register folder', (file) => {
    expect(audit({ [file]: '# Left behind' }).retiredRegisterFiles).toEqual([
      file,
    ]);
  });

  it('allows asset folders in retired folders until the archive goes', () => {
    expect(
      audit({ 'docs/debt/assets/debt-477/review.md': '# Receipt' })
        .retiredRegisterFiles,
    ).toEqual([]);
  });

  it('reports Markdown in a records subfolder, other than the legacy asset folders', () => {
    expect(
      audit({
        'docs/records/old/bug-950-x.md': '**Status:** Resolved',
        'docs/records/assets/bug-337/receipt.md': '# New asset folder',
        'docs/records/assets/debt-414/note.md': '# Legacy asset',
      }).strayRegisterFiles,
    ).toEqual([
      'docs/records/assets/bug-337/receipt.md',
      'docs/records/old/bug-950-x.md',
    ]);
  });

  it('reports a ledger list item that is not a well-formed entry', () => {
    expect(
      audit({
        'docs/records/closed.md': [
          '# Closed Records',
          '',
          '- BUG-100 · Fine · Resolved · 2026-10-01 · docs/a.md',
          '* BUG-101 · Star bullet · Resolved · 2026-10-01 · docs/b.md',
          '- **BUG-102** · Bold ID · Resolved · 2026-10-01 · docs/c.md',
          '  - BUG-103 · Indented · Resolved · 2026-10-01 · docs/d.md',
          '- BUG-104 · Too few fields · Resolved',
        ].join('\n'),
      }).malformedLedgerLines,
    ).toEqual([
      'docs/records/closed.md:4',
      'docs/records/closed.md:5',
      'docs/records/closed.md:6',
      'docs/records/closed.md:7',
    ]);
  });

  it('compares IDs by number, so zero-padding cannot hide a duplicate', () => {
    expect(
      audit({
        'docs/records/bug-05-open.md': '**Status:** Open',
        'docs/records/bug-07-a.md': '**Status:** Open',
        'docs/records/bug-007-b.md': '**Status:** Open',
        'docs/records/closed.md':
          '- BUG-005 · Closed · Resolved · 2026-10-01 · docs/a.md',
      }).duplicates.sort(),
    ).toEqual(['docs/records/bug-007-b.md', 'docs/records/bug-05-open.md']);
  });

  it.each(["Won't fix", 'Invalidated', 'Superseded', 'Deferred'])(
    'reports an open record whose status is the closed disposition %s',
    (status) => {
      expect(
        audit({ 'docs/records/bug-001-x.md': `**Status:** ${status}` })
          .closedLive,
      ).toEqual(['docs/records/bug-001-x.md']);
    },
  );

  it('allows each historical collision twice, and no more', () => {
    const line = (title: string) =>
      `- SPEC-028 · ${title} · Implemented · 2026-03-01 · docs/x.md`;
    expect(
      audit({
        'docs/records/closed.md': [
          line('One'),
          line('Two'),
          line('Three'),
        ].join('\n'),
      }).duplicateLedgerIds,
    ).toEqual(['SPEC-028']);
  });
});

describe('records command', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function fixture(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'documentation-records-'));
    roots.push(root);
    return root;
  }

  function populate(root: string, files: Record<string, string>): void {
    files[RECORDS.index] ??= '# Records\n\n**Now** — fixture';
    files[RECORDS.ledger] ??= '# Closed records';
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
  }

  it('exits nonzero for an ID listed twice in the ledger, and for a file left in a replaced register folder', () => {
    const root = fixture();
    populate(root, {
      [RECORDS.ledger]:
        '## Bugs\n\n- BUG-001 · One · Resolved · 2026-10-01 · #1 · a.md\n- BUG-001 · Two · Resolved · 2026-10-02 · #2 · b.md',
      'docs/bugs/index.md': '# Old index',
    });
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (json) => reports.push(JSON.parse(json))),
    ).toBe(1);
    expect(reports[0]).toMatchObject({
      duplicateLedgerIds: ['BUG-001'],
      retiredRegisterFiles: ['docs/bugs/index.md'],
    });
  });
});

describe('repository records', () => {
  const files = readDocumentationFiles(process.cwd());
  const exists = (file: string) => existsSync(path.resolve(file));
  let result: DocumentationAudit;

  beforeAll(() => {
    result = auditRecordLifecycle(files, exists);
  }, 30_000);

  it('keeps no record or index in a register folder that docs/records replaced', () => {
    expect(result.retiredRegisterFiles).toEqual([]);
  });

  it('lists each closed ID once in the ledger', () => {
    expect(result.duplicateLedgerIds).toEqual([]);
  });

  it.each(
    [...files.keys()].filter((file) => !file.startsWith('docs/_archive/')),
  )('cites records by ID rather than linking them in %s', (file) => {
    expect(recordLinks(file, files.get(file) ?? '')).toEqual([]);
  });
});
