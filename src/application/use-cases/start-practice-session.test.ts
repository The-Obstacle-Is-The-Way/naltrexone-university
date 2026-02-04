// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSeed, shuffleWithSeed } from '@/src/domain/services';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import type { StartPracticeSessionInput } from './start-practice-session';
import { StartPracticeSessionUseCase } from './start-practice-session';

describe('StartPracticeSessionUseCase', () => {
  it('returns sessionId when creating a practice session with deterministically shuffled questions', async () => {
    const userId = 'user-1';
    const now = new Date('2026-02-01T00:00:00Z');
    const tag = createTag({ id: 'tag-opioids', slug: 'opioids' });

    const questionRepository = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        difficulty: 'easy',
        tags: [tag],
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      createQuestion({
        id: 'q2',
        difficulty: 'medium',
        tags: [tag],
        createdAt: new Date('2026-01-31T00:00:00Z'),
        updatedAt: new Date('2026-01-31T00:00:00Z'),
      }),
      createQuestion({
        id: 'q3',
        difficulty: 'easy',
        tags: [tag],
        createdAt: new Date('2026-01-30T00:00:00Z'),
        updatedAt: new Date('2026-01-30T00:00:00Z'),
      }),
      createQuestion({
        id: 'q4',
        difficulty: 'medium',
        tags: [tag],
        createdAt: new Date('2026-01-29T00:00:00Z'),
        updatedAt: new Date('2026-01-29T00:00:00Z'),
      }),
    ]);

    const practiceSessionRepository = new FakePracticeSessionRepository();

    const useCase = new StartPracticeSessionUseCase(
      questionRepository,
      practiceSessionRepository,
      () => now,
    );

    const input: StartPracticeSessionInput = {
      userId,
      mode: 'exam' as const,
      count: 2,
      tagSlugs: ['opioids'],
      difficulties: ['easy', 'medium'],
    };

    const candidateIds = await questionRepository.listPublishedCandidateIds({
      tagSlugs: input.tagSlugs,
      difficulties: input.difficulties,
    });
    const seed = createSeed(userId, now.getTime());
    const expectedQuestionIds = shuffleWithSeed(candidateIds, seed).slice(0, 2);

    await expect(useCase.execute(input)).resolves.toEqual({
      sessionId: 'session-1',
    });

    const session = await practiceSessionRepository.findByIdAndUserId(
      'session-1',
      userId,
    );

    expect(session).toMatchObject({
      id: 'session-1',
      userId,
      mode: 'exam',
      questionIds: expectedQuestionIds,
      tagFilters: ['opioids'],
      difficultyFilters: ['easy', 'medium'],
      endedAt: null,
    });
  });

  it('returns paramsJson.count equal to actual questionIds length when requested count exceeds available questions', async () => {
    const userId = 'user-1';
    const now = new Date('2026-02-01T00:00:00Z');
    const tag = createTag({ id: 'tag-opioids', slug: 'opioids' });

    const questionRepository = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        difficulty: 'easy',
        tags: [tag],
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      createQuestion({
        id: 'q2',
        difficulty: 'medium',
        tags: [tag],
        createdAt: new Date('2026-01-31T00:00:00Z'),
        updatedAt: new Date('2026-01-31T00:00:00Z'),
      }),
    ]);

    const practiceSessionRepository = new FakePracticeSessionRepository();

    const useCase = new StartPracticeSessionUseCase(
      questionRepository,
      practiceSessionRepository,
      () => now,
    );

    await expect(
      useCase.execute({
        userId,
        mode: 'tutor',
        count: 10,
        tagSlugs: ['opioids'],
        difficulties: ['easy', 'medium'],
      }),
    ).resolves.toEqual({ sessionId: 'session-1' });

    const createInput = practiceSessionRepository.createInputs[0];
    expect(createInput).toBeTruthy();

    const paramsJson = createInput?.paramsJson as {
      count: number;
      questionIds: string[];
    };

    expect(paramsJson.questionIds).toHaveLength(2);
    expect(paramsJson.count).toBe(2);
  });

  it('returns NOT_FOUND error when filters yield zero questions', async () => {
    const useCase = new StartPracticeSessionUseCase(
      new FakeQuestionRepository([]),
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        mode: 'tutor',
        count: 10,
        tagSlugs: [],
        difficulties: [],
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'No questions found'));
  });
});
