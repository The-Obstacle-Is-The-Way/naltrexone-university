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
