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

  it('ignores labels inside code examples', () => {
    expect(
      audit({
        'docs/debt/index.md':
          '**Now** — current\n\n```md\n**Now** — example\n**Latest** — example\n```\n\n`**Latest**`',
        'docs/bugs/index.md': '**Now** — current',
        'docs/specs/index.md': '# Register without a Now stanza',
      }),
    ).toMatchObject({ invalidNow: [] });
  });

  // Variants would let the old changelog back in under another label.
  it.each([
    ['an Earlier stanza', '**Now** — current\n\n**Earlier** — previous'],
    ['a Latest variant', '**Now** — current\n\n**Latest:** what changed'],
    [
      'a dated Latest',
      '**Now** — current\n\n**Latest archival (2026-06-11):** x',
    ],
    ['a second Now variant', '**Now** — current\n\n**Now:** more'],
    [
      'an update history line',
      '**Now** — current\n\n**Update history:** [2026-10](./x.md)',
    ],
    ['a Now stanza with another label', '**Now:** — current'],
  ])('rejects %s in the bug and debt indexes', (_kind, index) => {
    expect(audit({ 'docs/debt/index.md': index })).toMatchObject({
      invalidNow: expect.arrayContaining(['docs/debt/index.md']),
    });
  });

  it('caps the Now stanza, with its list, at 2 KiB', () => {
    const list = (bytes: number) => `- ${'a'.repeat(bytes)}`;
    const invalidNow = (index: string) =>
      audit({ 'docs/bugs/index.md': index }).invalidNow;

    expect(invalidNow(`**Now** — current\n${list(2048)}`)).toContain(
      'docs/bugs/index.md',
    );
    expect(invalidNow(`**Now** — current\n${list(1900)}`)).not.toContain(
      'docs/bugs/index.md',
    );
  });

  // Beside a bug or debt index, only open records belong.
  it('reports any other Markdown file beside the bug or debt index', () => {
    expect(
      audit({
        'docs/debt/index.md': '**Now** — current',
        'docs/debt/register-history-2026-11.md': '**Earlier** — old',
        'docs/bugs/notes.md': 'notes',
        'docs/_archive/debt/register-history-2026-09.md': '**Earlier** — old',
        'docs/specs/notes.md': 'other registers are not restructured',
      }),
    ).toMatchObject({
      strayRegisterFiles: [
        'docs/bugs/notes.md',
        'docs/debt/register-history-2026-11.md',
      ],
    });
  });

  it.each([
    ['an impossible date', 'due 2026-13-45'],
    ['two due dates', 'due 2026-10-19, then due 2026-11-02'],
  ])('rejects a Verifying record with %s', (_kind, due) => {
    expect(
      audit({
        'docs/bugs/index.md':
          '**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md': `**Status:** Verifying — check; ${due}`,
      }),
    ).toMatchObject({ invalidVerifying: ['docs/bugs/bug-001-x.md'] });
  });

  it('requires the Now stanza to name each Verifying record', () => {
    const files = (now: string) => ({
      'docs/bugs/index.md': `**Now** — ${now}\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |`,
      'docs/bugs/bug-001-x.md': '**Status:** Verifying — check; due 2026-10-19',
    });
    expect(audit(files('nothing to see'))).toMatchObject({
      unnamedVerifying: ['docs/bugs/bug-001-x.md'],
    });
    expect(audit(files('BUG-001 is verifying'))).toMatchObject({
      unnamedVerifying: [],
    });
  });

  it('reports a due date more than 90 days out, as a notice', () => {
    const files = new Map(
      Object.entries({
        'docs/bugs/index.md':
          '**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md':
          '**Status:** Verifying — check; due 2027-01-04',
      }),
    );
    const exists = (file: string) => files.has(file);

    expect(
      auditRecordLifecycle(files, exists, '2026-10-05').verifyingFarFuture,
    ).toEqual([{ file: 'docs/bugs/bug-001-x.md', due: '2027-01-04' }]);
    expect(
      auditRecordLifecycle(files, exists, '2026-10-06').verifyingFarFuture,
    ).toEqual([]);
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

  it('reports a status wrapped onto a second line', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/bugs/bug-001-x.md':
          '**Status:** Open — short\ncontinued on the next line\n**Priority:** P2',
      }),
    ).toMatchObject({ longStatus: ['docs/bugs/bug-001-x.md'] });
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
