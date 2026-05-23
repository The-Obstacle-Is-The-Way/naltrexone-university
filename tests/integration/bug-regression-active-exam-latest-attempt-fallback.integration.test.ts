import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
} from './bug-regression-test-helpers';

async function insertAttemptAt(input: {
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId?: string;
  outcome?: { kind: 'answered'; selectedChoiceId: string };
  isCorrect?: boolean;
  answeredAt: Date;
}) {
  const hasSelectedChoiceId = input.selectedChoiceId !== undefined;
  const hasOutcome = input.outcome !== undefined;
  if (hasSelectedChoiceId === hasOutcome) {
    throw new Error(
      'insertAttemptAt requires exactly one of selectedChoiceId or outcome',
    );
  }

  await db.insert(schema.attempts).values({
    userId: input.userId,
    questionId: input.questionId,
    practiceSessionId: input.practiceSessionId,
    selectedChoiceId: input.selectedChoiceId ?? input.outcome?.selectedChoiceId,
    isCorrect: input.isCorrect ?? true,
    timeSpentSeconds: 5,
    answeredAt: input.answeredAt,
  });
}

describe('BUG-236: Dashboard streak timestamps exclude active-exam attempts', () => {
  it('filters active exam attempts while preserving ended exam, tutor, and standalone timestamps', async () => {
    const since = new Date('2026-02-01T00:00:00.000Z');
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const endedExamUser = await createUser(db, cleanup);
    const endedExamQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-ended-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const endedExamTimestamp = new Date('2026-04-01T12:00:00.000Z');
    const endedExamSession = await sessionRepo.create({
      userId: endedExamUser.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [endedExamQuestion.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, endedExamUser.id);
    await insertAttemptAt({
      userId: endedExamUser.id,
      questionId: endedExamQuestion.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: endedExamQuestion.correctChoiceId,
      answeredAt: endedExamTimestamp,
    });

    const tutorUser = await createUser(db, cleanup);
    const tutorQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const tutorTimestamp = new Date('2026-04-02T12:00:00.000Z');
    const tutorSession = await sessionRepo.create({
      userId: tutorUser.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [tutorQuestion.id],
      },
    });
    await insertAttemptAt({
      userId: tutorUser.id,
      questionId: tutorQuestion.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: tutorQuestion.correctChoiceId,
      answeredAt: tutorTimestamp,
    });

    const standaloneUser = await createUser(db, cleanup);
    const standaloneQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-standalone-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const standaloneTimestamp = new Date('2026-04-03T12:00:00.000Z');
    await insertAttemptAt({
      userId: standaloneUser.id,
      questionId: standaloneQuestion.id,
      practiceSessionId: null,
      selectedChoiceId: standaloneQuestion.correctChoiceId,
      answeredAt: standaloneTimestamp,
    });

    const activeExamUser = await createUser(db, cleanup);
    const activeExamQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-active-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const activeExamTimestamp = new Date('2026-04-04T12:00:00.000Z');
    const activeExamSession = await sessionRepo.create({
      userId: activeExamUser.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [activeExamQuestion.id],
      },
    });
    await insertAttemptAt({
      userId: activeExamUser.id,
      questionId: activeExamQuestion.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: activeExamQuestion.correctChoiceId,
      answeredAt: activeExamTimestamp,
    });

    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(endedExamUser.id, since),
    ).resolves.toEqual([endedExamTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(tutorUser.id, since),
    ).resolves.toEqual([tutorTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(standaloneUser.id, since),
    ).resolves.toEqual([standaloneTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(activeExamUser.id, since),
    ).resolves.toEqual([]);
  });

  it('keeps answeredAt descending order after filtering hidden active-exam rows', async () => {
    const user = await createUser(db, cleanup);
    const since = new Date('2026-02-01T00:00:00.000Z');
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const qStandalone = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-standalone-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qTutor = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qEndedExam = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-ended-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qActiveExam = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-active-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qTutor.id],
      },
    });
    await sessionRepo.end(tutorSession.id, user.id);

    const endedExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qEndedExam.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, user.id);

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qActiveExam.id],
      },
    });

    const hiddenNewest = new Date('2026-04-04T12:00:00.000Z');
    const visibleNewest = new Date('2026-04-03T12:00:00.000Z');
    const visibleMiddle = new Date('2026-04-02T12:00:00.000Z');
    const visibleOldest = new Date('2026-04-01T12:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: qStandalone.id,
      practiceSessionId: null,
      selectedChoiceId: qStandalone.correctChoiceId,
      answeredAt: visibleOldest,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qTutor.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: qTutor.correctChoiceId,
      answeredAt: visibleMiddle,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qEndedExam.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: qEndedExam.correctChoiceId,
      answeredAt: visibleNewest,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qActiveExam.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: qActiveExam.correctChoiceId,
      answeredAt: hiddenNewest,
    });

    const answeredAt = await attemptRepo.listAnsweredAtByUserIdSince(
      user.id,
      since,
    );

    expect(answeredAt).toEqual([visibleNewest, visibleMiddle, visibleOldest]);
  });
});

// ---------------------------------------------------------------------------
// BUG-235: History attempted-questions keeps latest visible fallback
// ---------------------------------------------------------------------------

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
