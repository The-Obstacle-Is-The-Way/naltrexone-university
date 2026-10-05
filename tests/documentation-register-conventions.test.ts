import { describe, expect, it } from 'vitest';
import {
  auditDocumentation,
  auditRecordLifecycle,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

// An index is the list of open work and the current position. Closed records
// live in the archive, and change history lives in git.
describe('documentation register conventions', () => {
  it.each(['debt', 'bugs', 'specs', 'brainstorming', 'audits', 'qa'])(
    'rejects duplicate Now stanzas in %s',
    (register) => {
      expect(
        audit({
          [`docs/${register}/index.md`]: '**Now** — new\n\n**Now** — old',
        }),
      ).toMatchObject({
        invalidNow: expect.arrayContaining([`docs/${register}/index.md`]),
      });
    },
  );

  it.each(['debt', 'bugs'])('requires the Now stanza in %s', (register) => {
    expect(
      audit({
        [`docs/${register}/index.md`]: '# Register\n\n**Earlier** — old',
      }),
    ).toMatchObject({
      invalidNow: expect.arrayContaining([`docs/${register}/index.md`]),
    });
  });

  // An index states the current position; its change history lives in git.
  it.each(['debt', 'bugs', 'specs', 'brainstorming', 'audits', 'qa'])(
    'rejects a Latest changelog stanza in %s',
    (register) => {
      expect(
        audit({
          [`docs/${register}/index.md`]:
            '**Now** — current\n\n**Latest** — what changed',
        }),
      ).toMatchObject({
        invalidNow: expect.arrayContaining([`docs/${register}/index.md`]),
      });
    },
  );

  it('ignores examples and historical labels', () => {
    expect(
      audit({
        'docs/debt/index.md':
          '**Now** — current\n\n**Earlier** — previous\n\n```md\n**Now** — example\n**Latest** — example\n```\n\n`**Latest**`\n\n**Latest archival (2026-06-11):** historic',
        'docs/bugs/index.md': '**Now** — current',
        'docs/specs/index.md': '# Register without a Now stanza',
      }),
    ).toMatchObject({ invalidNow: [] });
  });

  it('reports a register history file beside a live index', () => {
    expect(
      audit({
        'docs/debt/index.md': '**Now** — current',
        'docs/debt/register-history-2026-11.md': '**Earlier** — old',
        'docs/_archive/debt/register-history-2026-09.md': '**Earlier** — old',
      }),
    ).toMatchObject({ liveHistory: ['docs/debt/register-history-2026-11.md'] });
  });

  it('requires a due date on a Verifying record', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md':
          '**Status:** Verifying — stable IDs across two production builds',
      }),
    ).toMatchObject({ invalidVerifying: ['docs/bugs/bug-001-x.md'] });
  });

  it('keeps a Verifying record with a due date live and valid', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md':
          '**Status:** Verifying — stable IDs across two production builds; due 2026-10-19',
      }),
    ).toMatchObject({ invalidVerifying: [], closedLive: [] });
  });

  it('reports a Verifying record past its due date, as a notice', () => {
    const files = new Map(
      Object.entries({
        'docs/bugs/index.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md':
          '**Status:** Verifying — stable IDs; due 2026-10-19',
      }),
    );
    const exists = (file: string) => files.has(file);

    expect(
      auditRecordLifecycle(files, exists, '2026-10-19').verifyingOverdue,
    ).toEqual([]);
    expect(
      auditRecordLifecycle(files, exists, '2026-10-20').verifyingOverdue,
    ).toEqual([{ file: 'docs/bugs/bug-001-x.md', due: '2026-10-19' }]);
  });

  it('reports a live record whose status runs past one line', () => {
    const status = `Open — ${'x'.repeat(200)}`;
    expect(
      audit({
        'docs/bugs/index.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md': `**Status:** ${status}`,
      }),
    ).toMatchObject({ longStatus: ['docs/bugs/bug-001-x.md'] });
  });
});
