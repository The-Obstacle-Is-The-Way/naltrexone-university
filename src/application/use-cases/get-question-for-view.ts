import type {
  AttemptSingleQuestionReader,
  PracticeSessionRepository,
  QuestionRepository,
  QuestionRevisionBinding,
} from '@/src/application/ports/repositories';
import type { Attempt, Question } from '@/src/domain/entities';
import { isOmittedOutcome } from '@/src/domain/value-objects';

export type GetQuestionForViewInput = {
  userId: string;
  slug: string;
  /**
   * Present on a review of the learner's own answer: the attempt or session it
   * came from, or neither for the learner's latest attempt.
   */
  review?: { attemptId?: string; sessionId?: string };
};

export type GetQuestionForViewOutput = {
  /**
   * The revision to show. Its `availability` says what the learner is told
   * about the question now (ADR-022 Decision 1).
   */
  question: Question;
  /**
   * Still published, but the revision shown is no longer current: the
   * question was updated after the learner saw it (Pattern Registry F-12).
   */
  superseded: boolean;
  /**
   * ADR-022 Decision 4: the learner answered the revision shown, and its
   * answer key was corrected since. Never set outside a review, or for a
   * question no longer available, which has its own notice.
   */
  answerKeyChanged: boolean;
} | null;

type ReviewedItem = {
  binding: QuestionRevisionBinding;
  /** The learner selected a choice; an omitted attempt is not an answer. */
  answered: boolean;
};

type PracticeSessionReader = Pick<
  PracticeSessionRepository,
  'findByIdAndUserId'
>;

// ADR-021: a review shows the question as the revision of the learner's own
// item. A question withdrawn since stays reviewable, marked, by a learner who
// attempted it; anyone else, and any view outside review, sees only a
// published question.
export class GetQuestionForViewUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptSingleQuestionReader,
    private readonly sessions: PracticeSessionReader,
  ) {}

  async execute(
    input: GetQuestionForViewInput,
  ): Promise<GetQuestionForViewOutput> {
    if (!input.review) return this.published(input.slug);

    const questionId = await this.questions.findIdBySlug(input.slug);
    // Stryker disable next-line ConditionalExpression: a slug no question has has no published question either, so the reads below also end in null
    if (!questionId) return null;

    const reviewed = await this.reviewedItem(
      input.userId,
      questionId,
      input.review,
    );
    if (!reviewed) return this.published(input.slug);

    const question = await this.questions.findByIdForSession(reviewed.binding);
    if (!question) return null;
    const available = question.availability === 'available';
    // ADR-022 Decision 2: only a learner who answered a question no longer
    // published sees it.
    if (!available && !reviewed.answered) return null;
    return {
      question,
      superseded: available && !question.isCurrentRevision,
      // Whatever the question's state, as the score reads it: the review is
      // then shown ungraded (DEBT-498).
      answerKeyChanged: reviewed.answered && question.answerKeyChanged,
    };
  }

  private async published(slug: string): Promise<GetQuestionForViewOutput> {
    const question = await this.questions.findPublishedBySlug(slug);
    return question
      ? { question, superseded: false, answerKeyChanged: false }
      : null;
  }

  // The learner's own item under review, or null when they have none. Every
  // read is scoped to the learner, so another learner's ids resolve to null.
  // An item is answered when the learner's attempt at it selected a choice;
  // an omitted attempt and an unanswered item of a finished session are not.
  private async reviewedItem(
    userId: string,
    questionId: string,
    review: NonNullable<GetQuestionForViewInput['review']>,
  ): Promise<ReviewedItem | null> {
    if (review.attemptId) {
      const attempt = await this.attempts.findByIdAndUserId(
        review.attemptId,
        userId,
      );
      return attempt?.questionId === questionId
        ? this.attemptItem(userId, attempt)
        : null;
    }
    if (review.sessionId) {
      return this.sessionItem(userId, questionId, review.sessionId);
    }
    const latest = await this.attempts.findLatestByUserAndQuestion(
      userId,
      questionId,
    );
    return latest ? this.attemptItem(userId, latest) : null;
  }

  // As `GetPreviousAttemptUseCase`: an attempt inside an exam still in
  // progress is not yet an answer to review.
  private async attemptItem(
    userId: string,
    attempt: Attempt,
  ): Promise<ReviewedItem | null> {
    // Stryker disable next-line ConditionalExpression: a standalone attempt has no session, and a lookup without an id finds none
    if (attempt.practiceSessionId) {
      const session = await this.sessions.findByIdAndUserId(
        attempt.practiceSessionId,
        userId,
      );
      if (session?.mode === 'exam' && session.endedAt === null) return null;
    }
    return { binding: attempt, answered: !isOmittedOutcome(attempt.outcome) };
  }

  // As `GetPreviousAttemptUseCase` resolves a session review: the learner's
  // attempt in the session, else the item of their finished session.
  private async sessionItem(
    userId: string,
    questionId: string,
    sessionId: string,
  ): Promise<ReviewedItem | null> {
    const attempt = await this.attempts.findBySessionIdAndQuestionId(
      sessionId,
      userId,
      questionId,
    );
    if (attempt) return this.attemptItem(userId, attempt);

    const session = await this.sessions.findByIdAndUserId(sessionId, userId);
    // An active session's unanswered item is not a finished answer to review.
    if (!session || session.endedAt === null) return null;
    const item = session.questionStates.find(
      (state) => state.questionId === questionId,
    );
    return item ? { binding: item, answered: false } : null;
  }
}
