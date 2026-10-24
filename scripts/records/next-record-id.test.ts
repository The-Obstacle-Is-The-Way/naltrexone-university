import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nextRecordId,
  repositoryNextRecordId,
  runNextRecordIdCommand,
} from './next-record-id';

describe('nextRecordId', () => {
  it('takes one past the highest ID among open records and the ledger', () => {
    expect(
      nextRecordId(
        'debt',
        ['docs/records/debt-518-x.md', 'docs/records/debt-520-y.md'],
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

  it('refuses to guess outside a repository with a ledger', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'next-record-id-'));
    roots.push(root);
    expect(() => repositoryNextRecordId('bug', root)).toThrow(
      'docs/records/closed.md',
    );
  });

  // The ledger lists every ID the deleted archive held (DEBT-518).
  it('reads the records folder and the ledger, not a leftover archive', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'next-record-id-'));
    roots.push(root);
    const files: Record<string, string> = {
      'docs/records/bug-012-open.md': '# Open',
      'docs/records/closed.md':
        '- BUG-014 · Closed · Resolved · 2026-10-11 · a.md',
      'docs/_archive/bugs/bug-016-old.md': '# Leftover',
    };
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
    expect(repositoryNextRecordId('bug', root)).toBe('BUG-015');
  });
});

describe('runNextRecordIdCommand', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function repository(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'next-record-id-cli-'));
    roots.push(root);
    mkdirSync(path.join(root, 'docs/records'), { recursive: true });
    writeFileSync(
      path.join(root, 'docs/records/closed.md'),
      '- DEBT-007 · Closed · Resolved · 2026-10-11 · a.md',
    );
    return root;
  }

  function capture() {
    const lines: string[] = [];
    const errors: string[] = [];
    return {
      lines,
      errors,
      output: {
        log: (line: string) => lines.push(line),
        error: (line: string) => errors.push(line),
      },
    };
  }

  it('prints the next ID for a prefix', () => {
    const { lines, output } = capture();
    expect(runNextRecordIdCommand(['debt'], repository(), output)).toBe(0);
    expect(lines).toEqual(['DEBT-008']);
  });

  it('rejects anything but bug or debt, with usage', () => {
    const { errors, output } = capture();
    expect(runNextRecordIdCommand(['spec'], repository(), output)).toBe(2);
    expect(errors).toEqual([
      'Usage: tsx scripts/records/next-record-id.ts bug|debt',
    ]);
  });

  it('fails without the ledger rather than guess', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'next-record-id-cli-'));
    roots.push(root);
    const { lines, errors, output } = capture();
    expect(runNextRecordIdCommand(['bug'], root, output)).toBe(1);
    expect(lines).toEqual([]);
    expect(errors[0]).toContain('docs/records/closed.md');
  });
});
