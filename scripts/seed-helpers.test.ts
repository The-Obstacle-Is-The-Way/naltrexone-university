import { describe, expect, it } from 'vitest';
import {
  computeAnswerKeyChanges,
  computeChoiceSyncPlan,
  computeReferencedChoiceIds,
  computeTemporarySortOrders,
  parseExplanationAndReference,
} from './seed-helpers';

function getErrorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('Expected function to throw');
}

describe('computeChoiceSyncPlan', () => {
  it('merges choice references from attempts and normalized session state rows', () => {
    const attemptChoiceId = crypto.randomUUID();
    const latestChoiceId = crypto.randomUUID();
    const draftChoiceId = crypto.randomUUID();

    const referenced = computeReferencedChoiceIds({
      attemptRows: [
        { selectedChoiceId: attemptChoiceId },
        { selectedChoiceId: null },
      ],
      stateRows: [
        {
          latestSelectedChoiceId: latestChoiceId,
          draftSelectedChoiceId: null,
        },
        {
          latestSelectedChoiceId: null,
          draftSelectedChoiceId: draftChoiceId,
        },
      ],
    });

    expect([...referenced].sort()).toEqual(
      [attemptChoiceId, draftChoiceId, latestChoiceId].sort(),
    );
  });

  it('treats a draft-only normalized session state as a protected choice reference', () => {
    const draftChoiceId = crypto.randomUUID();

    const referenced = computeReferencedChoiceIds({
      attemptRows: [],
      stateRows: [
        {
          latestSelectedChoiceId: null,
          draftSelectedChoiceId: draftChoiceId,
        },
      ],
    });

    expect(referenced.has(draftChoiceId)).toBe(true);
  });

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
    ).toThrow(/referenced by an attempt or practice session state/i);
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

describe('computeTemporarySortOrders', () => {
  it('moves existing choices below the current minimum sort order in stable order', () => {
    const plans = computeTemporarySortOrders([
      { id: 'choice-a', sortOrder: 10 },
      { id: 'choice-b', sortOrder: 1 },
      { id: 'choice-c', sortOrder: 3 },
    ]);

    expect(plans).toEqual([
      { id: 'choice-a', sortOrder: -1 },
      { id: 'choice-b', sortOrder: -2 },
      { id: 'choice-c', sortOrder: -3 },
    ]);
  });

  it('keeps temporary sort orders below zero when existing rows are already negative', () => {
    const plans = computeTemporarySortOrders([
      { id: 'choice-a', sortOrder: -4 },
      { id: 'choice-b', sortOrder: 2 },
    ]);

    expect(plans).toEqual([
      { id: 'choice-a', sortOrder: -5 },
      { id: 'choice-b', sortOrder: -6 },
    ]);
  });

  it('returns no update plans when there are no existing choices', () => {
    expect(computeTemporarySortOrders([])).toEqual([]);
  });
});

describe('computeAnswerKeyChanges', () => {
  it('detects only isCorrect changes on existing labels', () => {
    const changes = computeAnswerKeyChanges({
      existingChoices: [
        { id: 'choice-a', label: 'A', isCorrect: false },
        { id: 'choice-b', label: 'B', isCorrect: true },
      ],
      desiredChoices: [
        { label: 'A', isCorrect: true },
        { label: 'B', isCorrect: false },
        { label: 'C', isCorrect: false },
      ],
    });

    expect(changes).toEqual([
      { id: 'choice-a', label: 'A', from: false, to: true },
      { id: 'choice-b', label: 'B', from: true, to: false },
    ]);
  });

  it.each([
    {
      name: 'same answer key',
      existingChoices: [
        { id: 'choice-a', label: 'A', isCorrect: false },
        { id: 'choice-b', label: 'B', isCorrect: true },
      ],
      desiredChoices: [
        { label: 'A', isCorrect: false },
        { label: 'B', isCorrect: true },
      ],
    },
    {
      name: 'new question',
      existingChoices: [],
      desiredChoices: [
        { label: 'A', isCorrect: false },
        { label: 'B', isCorrect: true },
      ],
    },
    {
      name: 'new choice only',
      existingChoices: [{ id: 'choice-a', label: 'A', isCorrect: true }],
      desiredChoices: [
        { label: 'A', isCorrect: true },
        { label: 'B', isCorrect: false },
      ],
    },
  ])('returns no changes for $name', ({ existingChoices, desiredChoices }) => {
    expect(
      computeAnswerKeyChanges({ existingChoices, desiredChoices }),
    ).toEqual([]);
  });
});

describe('parseExplanationAndReference', () => {
  it('splits general explanation from a trailing reference section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Keep naloxone first-line.',
      ].join('\n'),
    );
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('returns null reference when no reference heading exists', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe(explanationMd);
    expect(parsed.referenceMd).toBeNull();
  });

  it('returns an empty general explanation when the body only contains a reference section', () => {
    const explanationMd = ['### Reference', '', 'A concise AMA citation.'].join(
      '\n',
    );

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe('');
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('keeps the clinical pearl in general explanation when it appears before reference', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toContain(
      '**Clinical pearl:** Keep naloxone first-line.',
    );
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('rejects additional section headings after the reference section begins', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
      '',
      '### Notes',
      '',
      'This should not be accepted.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseExplanationAndReference(explanationMd),
    );

    expect(message).toContain('reference section must be terminal');
    expect(message).toContain('### Notes');
  });
});
