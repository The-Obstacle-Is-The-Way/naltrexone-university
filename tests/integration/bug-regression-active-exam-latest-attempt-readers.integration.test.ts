import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
  insertAttemptAt,
} from './bug-regression-test-helpers';

describe('BUG-239: Latest-attempt readers apply active-exam visibility', () => {
  async function createSessionForQuestion(input: {
    userId: string;
    questionId: string;
    mode: 'tutor' | 'exam';
    ended?: boolean;
  }) {
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: input.userId,
      mode: input.mode,
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [input.questionId],
      },
    });

    if (input.ended) {
      await sessionRepo.end(session.id, input.userId);
    }

    return session;
  }

  it('findLatestByUserAndQuestion falls back to an older standalone attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug239-latest-standalone-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const olderVisibleAt = new Date('2026-04-10T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-10T13:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    const activeExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'exam',
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      questionId: question.id,
      practiceSessionId: null,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
  });

  it('findLatestByUserAndQuestion falls back to an older tutor attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug239-latest-tutor-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const olderVisibleAt = new Date('2026-04-11T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-11T13:00:00.000Z');
    const tutorSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'tutor',
      ended: true,
    });

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    const activeExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'exam',
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
  });

  it('findLatestByUserAndQuestion falls back to an older ended-exam attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug239-latest-ended-exam-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const olderVisibleAt = new Date('2026-04-12T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-12T13:00:00.000Z');
    const endedExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'exam',
      ended: true,
    });

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: endedExamSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    const activeExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'exam',
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      questionId: question.id,
      practiceSessionId: endedExamSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
  });

  it('findLatestByUserAndQuestion hides an active-exam-only attempt until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug239-latest-no-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const activeExamAt = new Date('2026-04-13T12:00:00.000Z');
    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.correctChoiceId,
      },
      isCorrect: true,
      answeredAt: activeExamAt,
    });

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toBeNull();

    await sessionRepo.end(activeExamSession.id, user.id);

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.correctChoiceId,
      },
      isCorrect: true,
      answeredAt: activeExamAt,
    });
  });

  it('findMostRecentAnsweredAtByQuestionIds ignores active-exam timestamps while preserving older visible timestamps', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug239-most-recent-visible-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const olderVisibleAt = new Date('2026-04-14T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-14T13:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    const activeExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: question.id,
      mode: 'exam',
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    await expect(
      attemptRepo.findMostRecentAnsweredAtByQuestionIds(user.id, [question.id]),
    ).resolves.toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
      },
    ]);
  });

  it('findMostRecentAnsweredAtByQuestionIds omits questions whose only attempt is active-exam', async () => {
    const user = await createUser(db, cleanup);
    const hiddenQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug239-most-recent-active-only-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const visibleQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug239-most-recent-visible-only-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const activeExamAt = new Date('2026-04-15T13:00:00.000Z');
    const visibleAt = new Date('2026-04-15T12:00:00.000Z');
    const activeExamSession = await createSessionForQuestion({
      userId: user.id,
      questionId: hiddenQuestion.id,
      mode: 'exam',
    });

    await insertAttemptAt({
      userId: user.id,
      questionId: hiddenQuestion.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: hiddenQuestion.correctChoiceId,
      isCorrect: true,
      answeredAt: activeExamAt,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: visibleQuestion.id,
      practiceSessionId: null,
      selectedChoiceId: visibleQuestion.correctChoiceId,
      isCorrect: true,
      answeredAt: visibleAt,
    });

    await expect(
      attemptRepo.findMostRecentAnsweredAtByQuestionIds(user.id, [
        hiddenQuestion.id,
        visibleQuestion.id,
      ]),
    ).resolves.toEqual([
      {
        questionId: visibleQuestion.id,
        answeredAt: visibleAt,
      },
    ]);
  });
});
