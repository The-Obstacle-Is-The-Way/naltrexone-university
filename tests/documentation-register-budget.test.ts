import { describe, expect, it } from 'vitest';
import {
  auditDocumentation,
  auditRecordLifecycle,
  REGISTER_INDEX_BUDGET_BYTES,
} from '../scripts/records/documentation-archive';

type Files = Record<string, string>;
const exists = (files: Files) => (file: string) => Object.hasOwn(files, file);

// The budget belongs to the lifecycle audit, which parses only the index.
// The full audit also parses every file's links, which made these cases
// megabytes of Markdown parsing and timed one out under CI's coverage run.
function oversized(files: Files) {
  return auditRecordLifecycle(new Map(Object.entries(files)), exists(files))
    .oversized;
}

const now = '**Now** — current\n\n';
const index = 'docs/records/README.md';

describe('documentation register size budget', () => {
  // An index is a list of open records and the current position, not a
  // history; its budget keeps it that way. 11,000 characters of "€" are
  // under 32 KiB, but 33,000 bytes are over it.
  it('reports the records index over its 32 KiB budget, counted in bytes', () => {
    expect(oversized({ [index]: `${now}${'€'.repeat(11_000)}` })).toEqual([
      index,
    ]);
  });

  it('accepts the index at its budget and ignores other large files', () => {
    const indexAtBudget = `${now}${'a'.repeat(REGISTER_INDEX_BUDGET_BYTES - Buffer.byteLength(now))}`;
    const large = 'a'.repeat(REGISTER_INDEX_BUDGET_BYTES * 8);
    expect(
      oversized({
        [index]: indexAtBudget,
        'docs/records/debt-001-large-record.md': `**Status:** Active\n\n${large}`,
        'docs/guide.md': `${large}a`,
      }),
    ).toEqual([]);
  });

  it('is part of the full documentation audit', () => {
    const files = { [index]: `${now}${'€'.repeat(11_000)}` };
    expect(
      auditDocumentation(new Map(Object.entries(files)), exists(files))
        .oversized,
    ).toEqual([index]);
  });
});
