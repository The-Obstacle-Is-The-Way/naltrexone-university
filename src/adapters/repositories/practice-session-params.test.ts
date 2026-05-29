import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import {
  parsePracticeSessionParamsJson,
  toDomainPracticeSessionQuestionStates,
  toPracticeSessionParamsJson,
} from './practice-session-params';

const questionId = crypto.randomUUID();
const draftSelectedChoiceId = crypto.randomUUID();

describe('parsePracticeSessionParamsJson', () => {
  it('defaults missing draft fields for legacy question state payloads', () => {
    const parsed = parsePracticeSessionParamsJson(
      {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [questionId],
        questionStates: [
          {
            questionId: questionId,
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
      },
      'VALIDATION_ERROR',
    );

    expect(parsed.questionStates).toEqual([
      {
        questionId: questionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
    ]);
  });

  it('round-trips explicit draft fields across parse, domain mapping, and serialization', () => {
    const parsed = parsePracticeSessionParamsJson(
      {
        count: 1,
        tagSlugs: ['opioids'],
        difficulties: ['hard'],
        questionIds: [questionId],
        questionStates: [
          {
            questionId: questionId,
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: draftSelectedChoiceId,
            draftSavedAt: '2026-03-17T12:00:00.000Z',
            draftCumulativeMs: 45_000,
          },
        ],
      },
      'VALIDATION_ERROR',
    );

    const domainSession = createPracticeSession({
      questionIds: [questionId],
      questionStates: toDomainPracticeSessionQuestionStates(parsed),
      tagFilters: ['opioids'],
      difficultyFilters: ['hard'],
    });

    expect(toPracticeSessionParamsJson(domainSession)).toEqual({
      count: 1,
      tagSlugs: ['opioids'],
      difficulties: ['hard'],
      questionIds: [questionId],
      questionStates: [
        {
          questionId: questionId,
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: draftSelectedChoiceId,
          draftSavedAt: '2026-03-17T12:00:00.000Z',
          draftCumulativeMs: 45_000,
        },
      ],
    });
  });
});
