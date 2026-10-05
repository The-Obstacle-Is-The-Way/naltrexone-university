import { describe, expect, it } from 'vitest';
import {
  auditDocumentation,
  REGISTER_ARCHIVE_BUDGET_BYTES,
  REGISTER_INDEX_BUDGET_BYTES,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

const now = '**Now** — current\n\n';

describe('documentation register size budget', () => {
  // An index is a list of open records and the current position, not a
  // history; its budget keeps it that way.
  it.each(['docs/debt/index.md', 'docs/qa/index.md'])(
    'reports %s over its 32 KiB budget, counted in bytes',
    (file) => {
      expect(audit({ [file]: `${now}${'€'.repeat(23_000)}` })).toMatchObject({
        oversized: [file],
      });
    },
  );

  // Frozen register history is parsed whole by the link audit, so its size
  // bounds that audit's cost.
  it.each([
    'docs/_archive/debt/register-history-2026-09.md',
    'docs/_archive/bugs/register-frozen-2026-10-05.md',
  ])('reports %s over its 256 KiB budget', (file) => {
    expect(audit({ [file]: '€'.repeat(90_000) })).toMatchObject({
      oversized: [file],
    });
  });

  it('accepts register files at their budgets and ignores other large files', () => {
    const indexAtBudget = `${now}${'a'.repeat(REGISTER_INDEX_BUDGET_BYTES - Buffer.byteLength(now))}`;
    const archiveAtBudget = 'a'.repeat(REGISTER_ARCHIVE_BUDGET_BYTES);
    expect(
      audit({
        'docs/debt/index.md': indexAtBudget,
        'docs/_archive/debt/register-history-2026-09.md': archiveAtBudget,
        'docs/_archive/debt/register-frozen-2026-10-05.md': archiveAtBudget,
        'docs/debt/debt-001-large-record.md': `**Status:** Active\n\n${archiveAtBudget}`,
        'docs/guide.md': `${archiveAtBudget}a`,
      }),
    ).toMatchObject({ oversized: [] });
  });
});
