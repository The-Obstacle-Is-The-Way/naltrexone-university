import { describe, expect, it } from 'vitest';
import { choiceIdByLabel } from './question-revision-writer';

describe('choiceIdByLabel', () => {
  const appended = {
    revisionId: 'revision-2',
    revisionNumber: 2,
    choiceIdsByLabel: new Map([
      ['A', 'choice-a'],
      ['B', 'choice-b'],
    ]),
  };

  it("returns the id of the new revision's choice with that label", () => {
    expect(choiceIdByLabel(appended, 'B')).toBe('choice-b');
  });

  it('fails when the revision has no choice with that label', () => {
    expect(() => choiceIdByLabel(appended, 'E')).toThrow(
      'Revision 2 has no choice E',
    );
  });
});
