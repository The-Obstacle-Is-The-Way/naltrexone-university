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

  it('allows living documents in an old register folder', () => {
    expect(
      audit({ 'docs/specs/master_spec.md': '# Living spec' })
        .retiredRegisterFiles,
    ).toEqual([]);
  });

  it('reports a link into a record from anywhere but the index and owner-adopted policy', () => {
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
    ]);
    expect(audit(files).recordLinks).toHaveLength(2);
  });

  it('keeps only records, the index and the ledger directly in docs/records', () => {
    expect(
      audit({
        'docs/records/README.md': '**Now** — current',
        'docs/records/closed.md': '# Closed',
        'docs/records/debt-001-example.md': '**Status:** Open',
        'docs/records/notes.md': '# Stray',
        'docs/records/assets/debt-001/receipt.md': '# Asset',
      }).strayRegisterFiles,
    ).toEqual(['docs/records/notes.md']);
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
