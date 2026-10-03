import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@/src/domain/entities';
import { createPracticeSession } from '@/src/domain/test-helpers';
import type { QuestionAvailability } from '@/src/domain/value-objects';
import {
  type ItemQuestion,
  projectPracticeSessionSummary,
} from './practice-session-summary';

function everyAvailable(
  session: PracticeSession,
): ReadonlyMap<string, ItemQuestion> {
  return new Map(
    session.questionIds.map((questionId) => [
      questionId,
      { availability: 'available', answerKeyChanged: false },
    ]),
  );
}

// Each item's question by its state, with its key unchanged.
function itemQuestions(
  entries: readonly (readonly [string, QuestionAvailability])[],
): ReadonlyMap<string, ItemQuestion> {
  return new Map(
    entries.map(([questionId, availability]) => [
      questionId,
      { availability, answerKeyChanged: false },
    ]),
  );
}

describe('projectPracticeSessionSummary', () => {
  it('returns stable totals when no questions were answered', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(session, endedAt, everyAvailable(session)),
    ).toEqual({
      sessionId: 'session-1',
      mode: 'tutor',
      questionCount: 2,
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 0,
        scored: 2,
        correct: 0,
        accuracy: 0,
        durationSeconds: 600,
      },
    });
  });

  it('counts every scored item in the accuracy denominator, answered or not, when the session ends early', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-2',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(session, endedAt, everyAvailable(session)),
    ).toMatchObject({
      questionCount: 3,
      totals: {
        answered: 1,
        scored: 3,
        correct: 1,
        accuracy: 1 / 3,
        durationSeconds: 600,
      },
    });
  });

  it('returns a stable summary for zero-question sessions', () => {
    const endedAt = new Date('2026-02-01T00:00:30Z');
    const session = createPracticeSession({
      id: 'session-3',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: [],
      questionStates: [],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(session, endedAt, everyAvailable(session)),
    ).toEqual({
      sessionId: 'session-3',
      mode: 'tutor',
      questionCount: 0,
      endedAt: '2026-02-01T00:00:30.000Z',
      totals: {
        answered: 0,
        scored: 0,
        correct: 0,
        accuracy: 0,
        durationSeconds: 30,
      },
    });
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-missing-state',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(() =>
      projectPracticeSessionSummary(session, endedAt, everyAvailable(session)),
    ).toThrow(/missing normalized question state/);
  });

  it('returns canonical totals when persisted state includes out-of-band rows', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-4',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q-extra',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-extra',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:04:00Z'),
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(session, endedAt, everyAvailable(session)),
    ).toMatchObject({
      questionCount: 2,
      totals: {
        answered: 1,
        scored: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 600,
      },
    });
  });

  // ADR-022 Decision 3: an item counts toward the score only while its
  // question is available. It leaves both counts, answered or not, and stays
  // answered: that is activity.
  // ADR-022 Amendment (DEBT-494): an item counts when the learner had a fair
  // chance at it, recorded at the session's end, and its content is not in
  // doubt. A question retired since keeps counting.
  it('leaves out an item without a fair chance or in doubt, answered or not, and keeps a retired one', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const item = (
      questionId: string,
      answer: boolean | null,
      fairChanceAtEnd: boolean,
    ) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: answer === null ? null : `choice-${questionId}`,
      latestIsCorrect: answer,
      latestAnsweredAt:
        answer === null ? null : new Date('2026-02-01T00:03:00Z'),
      fairChanceAtEnd,
    });
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: [
        'q-right',
        'q-withdrawn',
        'q-retired',
        'q-removed',
        'q-wrong',
      ],
      questionStates: [
        item('q-right', true, true),
        item('q-withdrawn', true, true),
        item('q-retired', null, true),
        item('q-removed', true, false),
        item('q-wrong', false, true),
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(
        session,
        endedAt,
        itemQuestions([
          ['q-right', 'available'],
          ['q-withdrawn', 'withdrawn'],
          ['q-retired', 'retired'],
          ['q-removed', 'available'],
          ['q-wrong', 'available'],
        ]),
      ).totals,
    ).toEqual({
      answered: 4,
      scored: 3,
      correct: 1,
      accuracy: 1 / 3,
      durationSeconds: 600,
    });
  });

  it('scores an item whose question it cannot find as in doubt', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q-found', 'q-missing'],
      questionStates: ['q-found', 'q-missing'].map((questionId) => ({
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: `choice-${questionId}`,
        latestIsCorrect: true,
        latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
      })),
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(
        session,
        endedAt,
        itemQuestions([['q-found', 'available']]),
      ).totals,
    ).toMatchObject({ answered: 2, scored: 1, correct: 1, accuracy: 1 });
  });

  // ADR-022 Decision 4: an answered item whose graded key was since corrected
  // leaves the score; an unanswered one has no key to correct.
  it('leaves out an answer whose key was corrected since, but not an unanswered item', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q-corrected', 'q-unanswered', 'q-kept'],
      questionStates: [
        {
          questionId: 'q-corrected',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-corrected',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
        {
          questionId: 'q-unanswered',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q-kept',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-kept',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:04:00Z'),
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(
      projectPracticeSessionSummary(
        session,
        endedAt,
        new Map([
          [
            'q-corrected',
            { availability: 'available', answerKeyChanged: true },
          ],
          [
            'q-unanswered',
            { availability: 'available', answerKeyChanged: true },
          ],
          ['q-kept', { availability: 'available', answerKeyChanged: false }],
        ]),
      ).totals,
    ).toMatchObject({ answered: 2, scored: 2, correct: 1, accuracy: 0.5 });
  });
});
