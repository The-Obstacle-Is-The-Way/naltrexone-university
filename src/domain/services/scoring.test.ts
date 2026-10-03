import { describe, expect, it } from 'vitest';
import type { PracticeSessionQuestionState } from '../entities';
import {
  computeSessionScore,
  countsTowardScore,
  hadFairChanceAtEnd,
} from './scoring';

// ADR-022 Decision 3: an item counts toward a score only while its question
// is available. (Increment 4 adds: and the key it was graded against is still
// the current key.)
describe('countsTowardScore', () => {
  it.each([
    ['available', true],
    ['withdrawn', false],
    ['under_review', false],
    ['retired', false],
    [null, false],
  ] as const)(
    'counts an item whose question is %s: %s',
    (availability, counts) => {
      expect(countsTowardScore(availability)).toBe(counts);
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
