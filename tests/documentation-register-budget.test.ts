import { describe, expect, it } from 'vitest';
import { auditDocumentation } from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

describe('documentation register size budget', () => {
  // The lifecycle audit parses every register index in one hook, and each
  // history file is parsed whole, so their size bounds the audit's cost.
  it.each([
    'docs/debt/index.md',
    'docs/qa/index.md',
    'docs/debt/register-history-2026-09.md',
    'docs/bugs/register-history-2026-07.md',
  ])('reports %s over its 256 KiB budget, counted in bytes', (file) => {
    expect(
      audit({ [file]: `**Latest** — current\n\n${'€'.repeat(90_000)}` }),
    ).toMatchObject({ oversized: [file] });
  });

  it('accepts register files at their budget and ignores other large files', () => {
    const atBudget = 'a'.repeat(256 * 1024);
    const latest = '**Latest** — current\n\n';
    expect(
      audit({
        'docs/debt/index.md': `${latest}${atBudget.slice(Buffer.byteLength(latest))}`,
        'docs/debt/register-history-2026-09.md': atBudget,
        'docs/debt/debt-001-large-record.md': `**Status:** Active\n\n${atBudget}`,
        'docs/guide.md': `${atBudget}a`,
      }),
    ).toMatchObject({ oversized: [] });
  });
});
