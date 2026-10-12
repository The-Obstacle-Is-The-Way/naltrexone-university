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

// The records index is the list of open work and the current position. A
// closed record is a ledger line, and change history lives in git.
describe('documentation register conventions', () => {
  it('rejects duplicate Now stanzas in the records index', () => {
    expect(
      audit({ 'docs/records/README.md': '**Now** — new\n\n**Now** — old' }),
    ).toMatchObject({ invalidNow: ['docs/records/README.md'] });
  });

  it('requires the Now stanza in the records index', () => {
    expect(
      audit({ 'docs/records/README.md': '# Records\n\n**Earlier** — old' }),
    ).toMatchObject({ invalidNow: ['docs/records/README.md'] });
  });

  // The index states the current position; its change history lives in git.
  it('rejects a Latest changelog stanza in the records index', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n**Latest** — what changed',
      }),
    ).toMatchObject({ invalidNow: ['docs/records/README.md'] });
  });

  it('ignores labels inside code examples', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n```md\n**Now** — example\n**Latest** — example\n```\n\n`**Latest**`',
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
  ])('rejects %s in the records index', (_kind, index) => {
    expect(audit({ 'docs/records/README.md': index })).toMatchObject({
      invalidNow: ['docs/records/README.md'],
    });
  });

  it('caps the Now stanza, with its list, at 2 KiB', () => {
    const list = (bytes: number) => `- ${'a'.repeat(bytes)}`;
    const invalidNow = (index: string) =>
      audit({ 'docs/records/README.md': index }).invalidNow;

    expect(invalidNow(`**Now** — current\n${list(2048)}`)).toContain(
      'docs/records/README.md',
    );
    expect(invalidNow(`**Now** — current\n${list(1900)}`)).not.toContain(
      'docs/records/README.md',
    );
  });

  // Beside the records index, only open records and the ledger belong.
  it('reports any other Markdown file beside the records index', () => {
    expect(
      audit({
        'docs/records/README.md': '**Now** — current',
        'docs/records/closed.md': '# Closed',
        'docs/records/register-history-2026-11.md': '**Earlier** — old',
        'docs/records/notes.md': 'notes',
        'docs/_archive/debt/register-history-2026-09.md': '**Earlier** — old',
        'docs/specs/notes.md': 'a living document elsewhere',
      }),
    ).toMatchObject({
      strayRegisterFiles: [
        'docs/records/notes.md',
        'docs/records/register-history-2026-11.md',
      ],
    });
  });

  it.each([
    ['an impossible date', 'due 2026-13-45'],
    ['two due dates', 'due 2026-10-19, then due 2026-11-02'],
  ])('rejects a Verifying record with %s', (_kind, due) => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md': `**Status:** Verifying — check; ${due}`,
      }),
    ).toMatchObject({ invalidScheduledChecks: ['docs/records/bug-001-x.md'] });
  });

  // "due" followed by a digit is an attempt to schedule, so a date the weekly
  // check cannot read fails here instead of silently never coming due.
  it.each([
    ['Open — fix the parser; due 10-14'],
    ['Blocked — owner decision; due 2026-1-5'],
  ])('rejects the unreadable date in "%s"', (status) => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — none\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md': `**Status:** ${status}`,
      }),
    ).toMatchObject({ invalidScheduledChecks: ['docs/records/bug-001-x.md'] });
  });

  // A scheduled status names the action the weekly check will raise.
  it.each([['Open — due 2026-10-19'], ['Blocked — due 2026-10-19']])(
    'rejects "%s", which schedules no named action',
    (status) => {
      expect(
        audit({
          'docs/records/README.md':
            '**Now** — none\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
          'docs/records/bug-001-x.md': `**Status:** ${status}`,
        }),
      ).toMatchObject({
        invalidScheduledChecks: ['docs/records/bug-001-x.md'],
      });
    },
  );

  it('rejects a second due date that the weekly check cannot read', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — none\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Open — review; due 2026-10-19; due 2026-1-5',
      }),
    ).toMatchObject({ invalidScheduledChecks: ['docs/records/bug-001-x.md'] });
  });

  it('accepts an Open record that names its action and one due date', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — none\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Open — fix the parser; due 2099-01-01',
      }),
    ).toMatchObject({ invalidScheduledChecks: [] });
  });

  it('requires the Now stanza to name each Verifying record', () => {
    const files = (now: string) => ({
      'docs/records/README.md': `**Now** — ${now}\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |`,
      'docs/records/bug-001-x.md':
        '**Status:** Verifying — check; due 2026-10-19',
    });
    expect(audit(files('nothing to see'))).toMatchObject({
      unnamedVerifying: ['docs/records/bug-001-x.md'],
    });
    expect(audit(files('BUG-001 is verifying'))).toMatchObject({
      unnamedVerifying: [],
    });
  });

  it('reports a due date more than 90 days out, as a notice', () => {
    const files = new Map(
      Object.entries({
        'docs/records/README.md':
          '**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Verifying — check; due 2027-01-04',
      }),
    );
    const exists = (file: string) => files.has(file);

    expect(
      auditRecordLifecycle(files, exists, '2026-10-05').scheduledFarFuture,
    ).toEqual([{ file: 'docs/records/bug-001-x.md', due: '2027-01-04' }]);
    expect(
      auditRecordLifecycle(files, exists, '2026-10-06').scheduledFarFuture,
    ).toEqual([]);
  });

  it('requires a due date on a Verifying record', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Verifying — stable IDs across two production builds',
      }),
    ).toMatchObject({ invalidScheduledChecks: ['docs/records/bug-001-x.md'] });
  });

  it('keeps a Verifying record with a due date live and valid', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Verifying — stable IDs across two production builds; due 2026-10-19',
      }),
    ).toMatchObject({ invalidScheduledChecks: [], closedLive: [] });
  });

  it('reports a Verifying record past its due date, as a notice', () => {
    const files = new Map(
      Object.entries({
        'docs/records/README.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Verifying — stable IDs; due 2026-10-19',
      }),
    );
    const exists = (file: string) => files.has(file);

    expect(
      auditRecordLifecycle(files, exists, '2026-10-19').scheduledOverdue,
    ).toEqual([]);
    expect(
      auditRecordLifecycle(files, exists, '2026-10-20').scheduledOverdue,
    ).toEqual([{ file: 'docs/records/bug-001-x.md', due: '2026-10-19' }]);
  });

  it('reports a status wrapped onto a second line', () => {
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md':
          '**Status:** Open — short\ncontinued on the next line\n**Priority:** P2',
      }),
    ).toMatchObject({ longStatus: ['docs/records/bug-001-x.md'] });
  });

  it('reports a live record whose status runs past one line', () => {
    const status = `Open — ${'x'.repeat(200)}`;
    expect(
      audit({
        'docs/records/README.md':
          '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
        'docs/records/bug-001-x.md': `**Status:** ${status}`,
      }),
    ).toMatchObject({ longStatus: ['docs/records/bug-001-x.md'] });
  });
});
