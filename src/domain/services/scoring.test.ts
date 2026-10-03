import { describe, expect, it } from 'vitest';
import type { PracticeSessionQuestionState } from '../entities';
import {
  computeSessionScore,
  contentInDoubt,
  countsIfEndedNow,
  countsTowardScore,
  hadFairChanceAtEnd,
} from './scoring';

// ADR-022 Amendment (DEBT-494): an item counts when the learner had a fair
// chance at it, recorded at session end, and its content is not now in doubt:
// withdrawn or under review. (Increment 4 adds a corrected key.) Retirement is
// curation, not doubt.
describe('contentInDoubt', () => {
  it.each([
    ['available', false],
    ['retired', false],
    ['withdrawn', true],
    ['under_review', true],
    [null, true],
  ] as const)('a question %s is in doubt: %s', (availability, inDoubt) => {
    expect(contentInDoubt(availability)).toBe(inDoubt);
  });
});

describe('countsTowardScore', () => {
  it.each([
    [null, 'available', true],
    [true, 'available', true],
    [true, 'retired', true],
    [null, 'retired', true],
    [false, 'available', false],
    [false, 'retired', false],
    [true, 'withdrawn', false],
    [true, 'under_review', false],
    [true, null, false],
  ] as const)(
    'with a fair chance %s, counts an item whose question is %s: %s',
    (fairChanceAtEnd, availability, counts) => {
      expect(countsTowardScore({ fairChanceAtEnd, availability })).toBe(counts);
    },
  );
});

function state(
  questionId: string,
  answer: 'correct' | 'incorrect' | 'unanswered' | 'omitted',
): PracticeSessionQuestionState {
  return {
    questionId,
    questionRevisionId: crypto.randomUUID(),
    markedForReview: false,
    latestSelectedChoiceId:
      answer === 'correct' || answer === 'incorrect'
        ? crypto.randomUUID()
        : null,
    latestIsCorrect:
      answer === 'correct' ? true : answer === 'unanswered' ? null : false,
    latestAnsweredAt: answer === 'unanswered' ? null : new Date(),
    draftSelectedChoiceId: null,
    draftSavedAt: null,
    draftCumulativeMs: 0,
    fairChanceAtEnd: null,
  };
}

// ADR-022 Decisions 3 and 4: an answered item whose graded key was since
// corrected is in doubt too, whatever its question's availability.
describe('countsTowardScore with a corrected key', () => {
  it.each([
    [false, 'available', true],
    [true, 'available', false],
    [true, 'retired', false],
  ] as const)(
    'with its key corrected %s, counts an item whose question is %s: %s',
    (keyCorrected, availability, counts) => {
      expect(
        countsTowardScore({
          fairChanceAtEnd: true,
          availability,
          keyCorrected,
        }),
      ).toBe(counts);
    },
  );
});

describe('computeSessionScore', () => {
  it('scores every item when every question is available', () => {
    const states = [
      state('q1', 'correct'),
      state('q2', 'incorrect'),
      state('q3', 'unanswered'),
    ];

    expect(computeSessionScore(states, () => true)).toEqual({
      scored: 3,
      correct: 1,
    });
  });

  // An item that does not count leaves both the numerator and the denominator.
  it('leaves an unscored item out of both counts, answered or not', () => {
    const states = [
      state('q1', 'correct'),
      state('withdrawn-correct', 'correct'),
      state('withdrawn-unanswered', 'unanswered'),
      state('q4', 'omitted'),
    ];

    expect(
      computeSessionScore(
        states,
        (item) => !item.questionId.startsWith('withdrawn'),
      ),
    ).toEqual({ scored: 2, correct: 1 });
  });

  it('scores nothing when nothing counts', () => {
    expect(computeSessionScore([state('q1', 'correct')], () => false)).toEqual({
      scored: 0,
      correct: 0,
    });
  });
});

// ADR-022 Amendment (DEBT-494): whether the learner had a fair chance at a
// session item, recorded when its session ends. Its question was available
// then, or, in tutor mode, the learner had already answered it: a tutor answer
// is graded when given. An exam draft is final only at submission.
describe('hadFairChanceAtEnd', () => {
  it.each([
    ['tutor', false, 'available', true],
    ['tutor', true, 'available', true],
    ['tutor', true, 'retired', true],
    ['tutor', true, 'withdrawn', true],
    ['tutor', false, 'retired', false],
    ['tutor', false, 'under_review', false],
    ['exam', true, 'available', true],
    ['exam', false, 'available', true],
    ['exam', true, 'retired', false],
    ['exam', false, 'withdrawn', false],
    ['tutor', false, null, false],
    ['exam', true, null, false],
  ] as const)(
    'in %s mode, answered: %s, question %s at the end: %s',
    (mode, answered, availability, fairChance) => {
      expect(hadFairChanceAtEnd({ mode, answered, availability })).toBe(
        fairChance,
      );
    },
  );
});

// An active session's item, as it would count if the session ended now: the
// Review & Submit warning and the active notice say so (ADR-022 Decision 5,
// as amended).
describe('countsIfEndedNow', () => {
  it.each([
    ['exam', false, 'available', true],
    ['exam', true, 'retired', false],
    ['exam', false, 'retired', false],
    ['tutor', true, 'retired', true],
    ['tutor', true, 'withdrawn', false],
    ['tutor', false, 'retired', false],
    ['tutor', false, 'available', true],
  ] as const)(
    'in %s mode, answered: %s, question %s: counts %s',
    (mode, answered, availability, counts) => {
      expect(countsIfEndedNow({ mode, answered, availability })).toBe(counts);
    },
  );
});
