import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import { answeredOutcome } from '@/src/domain/value-objects';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
} from './bug-regression-test-helpers';
import { createTag } from './helpers';

describe('BUG-186: GetPracticeSessionReview active-exam secrecy', () => {
  it('redacts isCorrect for active exam and reveals it after session ends', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-review-secrecy-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // While exam is active: isCorrect must be null
    const activeResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(activeResult.rows).toHaveLength(1);
    expect(activeResult.rows[0]?.isCorrect).toBeNull();
    expect(activeResult.mode).toBe('exam');

    // End the session
    await sessionRepo.end(session.id, user.id);

    // After exam ends: isCorrect must be visible
    const endedResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(endedResult.rows).toHaveLength(1);
    expect(endedResult.rows[0]?.isCorrect).toBe(true);
  });

  it('does not redact isCorrect for tutor-mode sessions', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-tutor-no-redact-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // Tutor mode always shows correctness, even while active
    const result = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG-187: Dashboard count queries exclude active-exam attempts
// ---------------------------------------------------------------------------

describe('BUG-187: Dashboard counts exclude active-exam attempts', () => {
  it('excludes active-exam attempts from countByUserId and countCorrectByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-count-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-count-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    // Create an active exam session
    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    // Attempt attached to active exam
    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      outcome: answeredOutcome(q1.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Adhoc attempt (no session)
    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      outcome: answeredOutcome(q2.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const since = new Date('2000-01-01T00:00:00.000Z');

    // While exam is active: only adhoc attempt counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      1,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(1);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both attempts counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      2,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(2);
  });

  it('excludes active-exam attempts from listRecentByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-recent-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-recent-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      outcome: answeredOutcome(q1.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      outcome: answeredOutcome(q2.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // While exam is active: only adhoc attempt in recent list
    const activeRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(activeRecent).toHaveLength(1);
    expect(activeRecent[0]?.questionId).toBe(q2.id);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both in recent list
    const endedRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(endedRecent).toHaveLength(2);
  });

  it('includes tutor-session attempts in counts', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-count-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

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

    await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      outcome: answeredOutcome(question.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Tutor attempts always counted, even while session is active
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BUG-192: History attempted-questions excludes active-exam attempts
// ---------------------------------------------------------------------------

describe('BUG-192: Attempted-question history excludes active-exam attempts', () => {
  it('excludes active-exam attempts from attempted-question list and count until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const qExam = await createQuestion(db, cleanup, {
      slug: `it-attempted-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qAdhoc = await createQuestion(db, cleanup, {
      slug: `it-attempted-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExam.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExam.id,
      practiceSessionId: examSession.id,
      outcome: answeredOutcome(qExam.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhoc.id,
      practiceSessionId: null,
      outcome: answeredOutcome(qAdhoc.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const activeAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(activeAttempted).toHaveLength(1);
    expect(activeAttempted[0]?.questionId).toBe(qAdhoc.id);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedAttempted).toHaveLength(2);
    expect(endedAttempted.map((row) => row.questionId)).toEqual(
      expect.arrayContaining([qAdhoc.id, qExam.id]),
    );
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(2);
  });
});

// BUG-195: Question candidate status filters exclude active-exam attempts

describe('BUG-195: Question candidate status filters exclude active-exam attempts', () => {
  it('excludes active-exam attempts from unanswered/incorrect status filters until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const questionRepo = new DrizzleQuestionRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);
    const tag = await createTag(db, cleanup, {
      slug: `it-bug195-tag-${randomUUID()}`,
      kind: 'topic',
    });

    const qExamIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-exam-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocCorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-correct-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qNeverAnswered = await createQuestion(db, cleanup, {
      slug: `it-bug195-never-answered-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      tagIds: [tag.id],
    });

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExamIncorrect.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExamIncorrect.id,
      practiceSessionId: examSession.id,
      outcome: answeredOutcome(qExamIncorrect.incorrectChoiceId),
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocIncorrect.id,
      practiceSessionId: null,
      outcome: answeredOutcome(qAdhocIncorrect.incorrectChoiceId),
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocCorrect.id,
      practiceSessionId: null,
      outcome: answeredOutcome(qAdhocCorrect.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 0,
    });

    const activeUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(new Set(activeUnanswered)).toEqual(
      new Set([qNeverAnswered.id, qExamIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(2);

    const activeIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(activeIncorrect).toEqual([qAdhocIncorrect.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(endedUnanswered).toEqual([qNeverAnswered.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    const endedIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(new Set(endedIncorrect)).toEqual(
      new Set([qExamIncorrect.id, qAdhocIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(2);
  });
});
