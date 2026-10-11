import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nextRecordId, repositoryNextRecordId } from './next-record-id';

describe('nextRecordId', () => {
  it('takes one past the highest ID among open records, the ledger and the archive', () => {
    expect(
      nextRecordId(
        'debt',
        ['docs/records/debt-518-x.md', 'docs/_archive/debt/debt-520-y.md'],
        '- DEBT-519 · Closed · Resolved · 2026-10-11 · a.md',
      ),
    ).toBe('DEBT-521');
  });

  it('counts only its own prefix', () => {
    expect(
      nextRecordId(
        'bug',
        ['docs/records/bug-336-x.md', 'docs/records/debt-900-y.md'],
        '- DEBT-901 · Other · Resolved · 2026-10-11 · b.md',
      ),
    ).toBe('BUG-337');
  });

  it('pads to three digits', () => {
    expect(nextRecordId('bug', [], '')).toBe('BUG-001');
  });
});

describe('repositoryNextRecordId', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  it('reads the records folder, the ledger and the archive', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'next-record-id-'));
    roots.push(root);
    const files: Record<string, string> = {
      'docs/records/bug-012-open.md': '# Open',
      'docs/records/closed.md':
        '- BUG-014 · Closed · Resolved · 2026-10-11 · a.md',
      'docs/_archive/bugs/bug-013-old.md': '# Old',
    };
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
    expect(repositoryNextRecordId('bug', root)).toBe('BUG-015');
  });
});
