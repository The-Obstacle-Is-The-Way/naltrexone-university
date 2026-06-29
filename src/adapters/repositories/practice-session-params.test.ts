import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@/src/domain/entities';
import {
  parsePracticeSessionParamsJson,
  toPracticeSessionParamsJson,
} from './practice-session-params';

const questionId = crypto.randomUUID();
const draftSelectedChoiceId = crypto.randomUUID();

describe('parsePracticeSessionParamsJson', () => {
  it('ignores stale questionStates when parsing immutable session metadata', () => {
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

    expect(parsed).toEqual({
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [questionId],
    });
  });

  it('serializes only immutable session metadata', () => {
    const domainSession: PracticeSession = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      mode: 'exam' as const,
      questionIds: [questionId],
      questionStates: [
        {
          questionId,
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: draftSelectedChoiceId,
          draftSavedAt: new Date('2026-03-17T12:00:00.000Z'),
          draftCumulativeMs: 45_000,
        },
      ],
      tagFilters: ['opioids'],
      difficultyFilters: ['hard'],
      startedAt: new Date('2026-03-17T12:00:00.000Z'),
      endedAt: null,
    };

    expect(toPracticeSessionParamsJson(domainSession)).toEqual({
      count: 1,
      tagSlugs: ['opioids'],
      difficulties: ['hard'],
      questionIds: [questionId],
    });
  });
});
