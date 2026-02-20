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

  it('extracts referenceMd from content with a reference section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBe(
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    );
  });

  it('extracts referenceMd when another heading appears before reference', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '### Clinical Pearl',
      'Ancillary note.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.perChoice.get('A')).toBe('Reason A.');
    expect(parsed.referenceMd).toBe(
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    );
  });

  it('extracts multiline referenceMd when citation spans lines', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al.",
      'Combined pharmacotherapies and behavioral interventions',
      'for alcohol dependence. JAMA. 2006;295(17):2003-2017.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBe(
      [
        "Anton RF, O'Malley SS, Ciraulo DA, et al.",
        'Combined pharmacotherapies and behavioral interventions',
        'for alcohol dependence. JAMA. 2006;295(17):2003-2017.',
      ].join('\n'),
    );
  });

  it('returns null referenceMd when no reference section exists', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBeNull();
  });

  it('preserves generalExplanation and perChoice when reference is present', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Keep naloxone first-line.',
      ].join('\n'),
    );
    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Reason A.',
      C: 'Reason C.',
    });
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });
});
