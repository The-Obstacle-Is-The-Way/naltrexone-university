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

describe('BUG-235: Attempted-question history keeps latest visible fallback', () => {
  it('falls back to an older standalone attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-standalone-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-01T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-02T12:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });

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
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const activeRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(activeRows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(activeRows.length);

    await sessionRepo.end(activeExamSession.id, user.id);

    const endedRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedRows).toEqual([
      {
        questionId: question.id,
        answeredAt: newerActiveExamAt,
        isCorrect: true,
        sessionId: activeExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(endedRows.length);
  });

  it('falls back to an older tutor attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-tutor-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-03T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-04T12:00:00.000Z');

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
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
      practiceSessionId: tutorSession.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    await sessionRepo.end(tutorSession.id, user.id);

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
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const rows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(rows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: tutorSession.id,
        sessionMode: 'tutor',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(rows.length);
  });

  it('falls back to an older ended-exam attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-ended-exam-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-05T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-06T12:00:00.000Z');

    const endedExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, user.id);
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });

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
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const rows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(rows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: endedExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(rows.length);
  });

  it('continues to hide an active-exam attempt when no visible fallback exists', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-no-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const activeExamAt = new Date('2026-04-07T12:00:00.000Z');

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
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: activeExamAt,
    });

    await expect(
      attemptRepo.listAttemptedQuestionsByUserId(user.id, 10, 0),
    ).resolves.toEqual([]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(0);

    await sessionRepo.end(activeExamSession.id, user.id);

    const endedRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedRows).toEqual([
      {
        questionId: question.id,
        answeredAt: activeExamAt,
        isCorrect: true,
        sessionId: activeExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(endedRows.length);
  });
});

// ---------------------------------------------------------------------------
// BUG-239: Latest-attempt readers apply active-exam visibility
// ---------------------------------------------------------------------------
