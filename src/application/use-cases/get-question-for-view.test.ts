import { describe, expect, it } from 'vitest';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import type { Attempt, PracticeSession, Question } from '@/src/domain/entities';
import {
  createAttempt,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import {
  type GetQuestionForViewInput,
  GetQuestionForViewUseCase,
} from './get-question-for-view';

const userId = 'user-1';
const otherUserId = 'user-2';
const slug = 'reviewed-question';

// The current revision of a question and the older one the learner answered.
function revisions(status: Question['status']) {
  const questionId = crypto.randomUUID();
  return {
    current: createQuestion({
      id: questionId,
      slug,
      status,
      stemMd: 'Current',
    }),
    answered: createQuestion({
      id: questionId,
      revisionId: crypto.randomUUID(),
      slug,
      status,
      stemMd: 'Answered',
    }),
  };
}

function answerOf(
  question: Question,
  overrides: Partial<Attempt> = {},
): Attempt {
  return createAttempt({
    userId,
    questionId: question.id,
    questionRevisionId: question.revisionId,
    ...overrides,
  });
}

// A session over the question; the learner's answer to it, if any, is an
// attempt in that session.
function sessionOver(
  question: Question,
  overrides: Partial<Omit<PracticeSession, 'questionStates'>> = {},
): PracticeSession {
  return createPracticeSession({
    userId,
    endedAt: new Date('2026-09-01T00:00:00Z'),
    questionIds: [question.id],
    questionStates: [
      {
        questionId: question.id,
        questionRevisionId: question.revisionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      },
    ],
    ...overrides,
  });
}

function view(
  questions: readonly Question[],
  history: { attempts?: Attempt[]; sessions?: PracticeSession[] } = {},
) {
  // Here a question no longer published was withdrawn: each has a withdrawal.
  const useCase = new GetQuestionForViewUseCase(
    new FakeQuestionRepository(questions, {
      withdrawals: questions
        .filter((question) => question.status !== 'published')
        .map((question) => ({
          questionId: question.id,
          questionRevisionId: question.revisionId,
        })),
    }),
    new FakeAttemptRepository(history.attempts ?? []),
    new FakePracticeSessionRepository(history.sessions ?? []),
  );
  return (review?: GetQuestionForViewInput['review']) =>
    useCase.execute({ userId, slug, ...(review ? { review } : {}) });
}

describe('GetQuestionForViewUseCase', () => {
  it('shows a published question outside review', async () => {
    const { current } = revisions('published');

    await expect(view([current])()).resolves.toEqual({
      question: current,
      superseded: false,
    });
  });

  // Pattern Registry F-12: the learner sees the revision they answered, and
  // is told when a newer one has replaced it.
  it('marks a review of an answered revision that is no longer current as updated', async () => {
    const { current, answered } = revisions('published');

    await expect(
      view([current, answered], { attempts: [answerOf(answered)] })({}),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered' },
      superseded: true,
    });
  });

  it('does not mark a review of the current revision as updated', async () => {
    const { current } = revisions('published');

    await expect(
      view([current], { attempts: [answerOf(current)] })({}),
    ).resolves.toMatchObject({ superseded: false });
  });

  it('marks a withdrawn question withdrawn only, even when a newer revision exists', async () => {
    const { current, answered } = revisions('archived');

    await expect(
      view([current, answered], { attempts: [answerOf(answered)] })({}),
    ).resolves.toMatchObject({
      question: { availability: 'withdrawn' },
      superseded: false,
    });
  });

  it('shows no withdrawn question outside review, even to a learner who answered it', async () => {
    const { current, answered } = revisions('archived');

    await expect(
      view([current, answered], { attempts: [answerOf(answered)] })(),
    ).resolves.toBeNull();
  });

  it('shows nothing for a slug no question has', async () => {
    const { current } = revisions('published');

    await expect(
      view([createQuestion({ id: current.id, slug: 'another-slug' })])({}),
    ).resolves.toBeNull();
  });

  it('shows the revision of the learner’s latest answer, marked withdrawn', async () => {
    const { current, answered } = revisions('archived');

    await expect(
      view([current, answered], { attempts: [answerOf(answered)] })({}),
    ).resolves.toMatchObject({
      question: {
        stemMd: 'Answered',
        status: 'archived',
        availability: 'withdrawn',
      },
    });
  });

  // ADR-022 Decision 2: an omitted attempt is not an answer, so it reveals
  // nothing of a question no longer published.
  it.each([
    ['the latest attempt', () => ({})],
    ['a named session', (sessionId: string) => ({ sessionId })],
  ] as const)(
    'shows no withdrawn question for an omitted attempt reached through %s',
    async (_case, review) => {
      const { current, answered } = revisions('archived');
      const session = sessionOver(answered);
      const omitted = answerOf(answered, {
        outcome: omittedOutcome(),
        isCorrect: false,
        practiceSessionId: session.id,
      });

      await expect(
        view([current, answered], {
          attempts: [omitted],
          sessions: [session],
        })(review(session.id)),
      ).resolves.toBeNull();
    },
  );

  it('shows the revision the learner answered for a question still published', async () => {
    const { current, answered } = revisions('published');

    await expect(
      view([current, answered], { attempts: [answerOf(answered)] })({}),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered' },
    });
  });

  it('shows the revision a named attempt answered, not the latest', async () => {
    const { current, answered } = revisions('archived');
    const named = answerOf(answered, {
      answeredAt: new Date('2026-08-01T00:00:00Z'),
    });
    const latest = answerOf(current, {
      answeredAt: new Date('2026-09-01T00:00:00Z'),
    });

    await expect(
      view([current, answered], { attempts: [named, latest] })({
        attemptId: named.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered', availability: 'withdrawn' },
    });
  });

  it('shows the revision the learner answered in a finished session', async () => {
    const { current, answered } = revisions('archived');
    const session = sessionOver(answered);
    const attempt = answerOf(answered, { practiceSessionId: session.id });

    await expect(
      view([current, answered], { attempts: [attempt], sessions: [session] })({
        sessionId: session.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered', availability: 'withdrawn' },
    });
  });

  it('shows the revision the learner answered in a session still active', async () => {
    const { current, answered } = revisions('archived');
    const session = sessionOver(answered, { endedAt: null });
    const attempt = answerOf(answered, { practiceSessionId: session.id });

    await expect(
      view([current, answered], { attempts: [attempt], sessions: [session] })({
        sessionId: session.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered', availability: 'withdrawn' },
    });
  });

  // ADR-021 §3: the learner saw an unanswered item but never attempted it.
  it('shows no withdrawn question for an item the learner left unanswered in a finished session', async () => {
    const { current, answered } = revisions('archived');
    const session = sessionOver(answered);

    await expect(
      view([current, answered], { sessions: [session] })({
        sessionId: session.id,
      }),
    ).resolves.toBeNull();
  });

  it('shows an unanswered item of a finished session as its bound revision while the question is published', async () => {
    const { current, answered } = revisions('published');
    const session = sessionOver(answered);

    await expect(
      view([current, answered], { sessions: [session] })({
        sessionId: session.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered' },
    });
  });

  // Each review names no answer of this learner to this question, so the
  // view falls back to the published question: a withdrawn one never shows.
  const noAnswerOfTheLearner: [
    string,
    (answered: Question) => {
      attempts?: Attempt[];
      sessions?: PracticeSession[];
      review: NonNullable<GetQuestionForViewInput['review']>;
    },
  ][] = [
    ['no attempt at all', () => ({ review: {} })],
    [
      'another learner’s attempt',
      (answered) => {
        const attempt = answerOf(answered, { userId: otherUserId });
        return { attempts: [attempt], review: { attemptId: attempt.id } };
      },
    ],
    [
      'the learner’s attempt at another question',
      () => {
        const attempt = answerOf(createQuestion());
        return { attempts: [attempt], review: { attemptId: attempt.id } };
      },
    ],
    [
      'an active session',
      (answered) => {
        const session = sessionOver(answered, { endedAt: null });
        return { sessions: [session], review: { sessionId: session.id } };
      },
    ],
    [
      'a finished session without the question',
      () => {
        const session = sessionOver(createQuestion());
        return { sessions: [session], review: { sessionId: session.id } };
      },
    ],
    [
      'another learner’s finished session',
      (answered) => {
        const session = sessionOver(answered, { userId: otherUserId });
        return { sessions: [session], review: { sessionId: session.id } };
      },
    ],
  ];

  it.each(noAnswerOfTheLearner)(
    'shows no withdrawn question for a review naming %s',
    async (_name, arrange) => {
      const { current, answered } = revisions('archived');
      const { review, ...history } = arrange(answered);

      await expect(view([current, answered], history)(review)).resolves.toBe(
        null,
      );
    },
  );

  it.each(noAnswerOfTheLearner)(
    'shows the current published question for a review naming %s',
    async (_name, arrange) => {
      const { current, answered } = revisions('published');
      const { review, ...history } = arrange(answered);

      await expect(
        view([current, answered], history)(review),
      ).resolves.toMatchObject({
        question: { stemMd: 'Current' },
      });
    },
  );

  // As `GetPreviousAttemptUseCase`: an attempt inside an exam still in
  // progress is not yet an answer to review, so the view falls back to the
  // published question.
  const examInProgress = (question: Question) => {
    const session = sessionOver(question, { mode: 'exam', endedAt: null });
    const attempt = answerOf(question, { practiceSessionId: session.id });
    return { attempts: [attempt], sessions: [session], attempt, session };
  };
  const namingTheExamAttempt: [
    string,
    (
      exam: ReturnType<typeof examInProgress>,
    ) => GetQuestionForViewInput['review'],
  ][] = [
    ['the attempt', ({ attempt }) => ({ attemptId: attempt.id })],
    ['the session', ({ session }) => ({ sessionId: session.id })],
  ];

  it.each(namingTheExamAttempt)(
    'shows no withdrawn question for an exam in progress, reviewed by %s',
    async (_name, review) => {
      const { current, answered } = revisions('archived');
      const exam = examInProgress(answered);

      await expect(
        view([current, answered], exam)(review(exam)),
      ).resolves.toBeNull();
    },
  );

  it.each(namingTheExamAttempt)(
    'shows the current published question for an exam in progress, reviewed by %s',
    async (_name, review) => {
      const { current, answered } = revisions('published');
      const exam = examInProgress(answered);

      await expect(
        view([current, answered], exam)(review(exam)),
      ).resolves.toMatchObject({
        question: { stemMd: 'Current' },
      });
    },
  );

  it('shows the revision the learner answered in a finished exam', async () => {
    const { current, answered } = revisions('archived');
    const session = sessionOver(answered, { mode: 'exam' });
    const attempt = answerOf(answered, { practiceSessionId: session.id });

    await expect(
      view([current, answered], { attempts: [attempt], sessions: [session] })({
        attemptId: attempt.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered', availability: 'withdrawn' },
    });
  });

  // The session can be deleted between the attempt read and the session
  // read. The answer stays reviewable.
  it('shows the revision of an answer whose session is no longer found', async () => {
    const { current, answered } = revisions('archived');
    const attempt = answerOf(answered, {
      practiceSessionId: crypto.randomUUID(),
    });

    await expect(
      view([current, answered], { attempts: [attempt] })({
        attemptId: attempt.id,
      }),
    ).resolves.toMatchObject({
      question: { stemMd: 'Answered', availability: 'withdrawn' },
    });
  });

  // The question can be deleted after its slug is read. The view shows
  // nothing rather than failing.
  it('shows nothing when the question is deleted after its slug is read', async () => {
    const { answered } = revisions('published');
    class DeletedAfterSlugRead extends FakeQuestionRepository {
      override async findIdBySlug() {
        return answered.id;
      }
    }
    const useCase = new GetQuestionForViewUseCase(
      new DeletedAfterSlugRead([]),
      new FakeAttemptRepository([answerOf(answered)]),
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({ userId, slug, review: {} }),
    ).resolves.toBeNull();
  });
});
