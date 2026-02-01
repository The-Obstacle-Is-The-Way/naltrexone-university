import { describe, expect, it } from 'vitest';
import { computeChoiceSyncPlan } from './seed-helpers';

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
