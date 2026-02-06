import { describe, expect, it } from 'vitest';
import { computeChoiceSyncPlan, parseChoiceExplanations } from './seed-helpers';

function mapEntries(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

describe('computeChoiceSyncPlan', () => {
  it('throws if asked to delete a choice that is referenced by an attempt', () => {
    expect(() =>
      computeChoiceSyncPlan({
        existingChoices: [
          { id: 'c-a', label: 'A' },
          { id: 'c-b', label: 'B' },
          { id: 'c-c', label: 'C' },
        ],
        desiredChoices: [{ label: 'A' }, { label: 'B' }],
        referencedChoiceIds: new Set(['c-c']),
      }),
    ).toThrow(/referenced/i);
  });

  it('returns delete ids only for unreferenced removed labels', () => {
    const plan = computeChoiceSyncPlan({
      existingChoices: [
        { id: 'c-a', label: 'A' },
        { id: 'c-b', label: 'B' },
        { id: 'c-c', label: 'C' },
      ],
      desiredChoices: [{ label: 'A' }, { label: 'B' }],
      referencedChoiceIds: new Set(),
    });

    expect(plan.deleteChoiceIds).toEqual(['c-c']);
  });

  it('does not delete existing choices when the label set is unchanged', () => {
    const plan = computeChoiceSyncPlan({
      existingChoices: [
        { id: 'c-a', label: 'A' },
        { id: 'c-b', label: 'B' },
      ],
      desiredChoices: [{ label: 'A' }, { label: 'B' }],
      referencedChoiceIds: new Set(['c-a', 'c-b']),
    });

    expect(plan.deleteChoiceIds).toEqual([]);
  });
});

describe('parseChoiceExplanations', () => {
  it('returns the full explanation as general text when no wrong-answers section exists', () => {
    const explanationMd = [
      'This is the core explanation.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(explanationMd);
    expect(parsed.perChoice.size).toBe(0);
  });

  it('extracts per-choice explanations from the wrong-answers section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Distinguish intoxication from withdrawal.',
      '',
      '**Why other answers are wrong:**',
      '- A) Incorrect because reason A.',
      '- C) Incorrect because reason C.',
      '- D) Incorrect because reason D.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Distinguish intoxication from withdrawal.',
      ].join('\n'),
    );
    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Incorrect because reason A.',
      C: 'Incorrect because reason C.',
      D: 'Incorrect because reason D.',
    });
  });

  it('supports alternate bullet formats and multiline bullet bodies', () => {
    const explanationMd = [
      'General rationale.',
      '',
      '**Why other answers are wrong:**',
      '* A. First sentence.',
      '  Continuation sentence.',
      '- B)) Second explanation.',
      '+ C: Third explanation.',
      '- E) Fifth explanation.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe('General rationale.');
    expect(parsed.perChoice.get('A')).toContain('First sentence.');
    expect(parsed.perChoice.get('A')).toContain('Continuation sentence.');
    expect(mapEntries(parsed.perChoice)).toMatchObject({
      B: 'Second explanation.',
      C: 'Third explanation.',
      E: 'Fifth explanation.',
    });
  });
});
