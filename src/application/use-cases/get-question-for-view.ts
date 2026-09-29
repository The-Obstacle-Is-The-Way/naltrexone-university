import type {
  AttemptSingleQuestionReader,
  PracticeSessionRepository,
  QuestionRepository,
  QuestionRevisionBinding,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

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
  question: Question;
  /** Withdrawn after the learner answered it (ADR-021 §3). */
  withdrawn: boolean;
} | null;

type PracticeSessionReader = Pick<
  PracticeSessionRepository,
  'findByIdAndUserId'
>;

// ADR-021: a review shows the question as the revision the learner answered.
// A question withdrawn since stays reviewable by that learner, marked; anyone
// else, and any view outside review, sees only a published question.
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
    if (!questionId) return null;

    const binding = await this.reviewedBinding(
      input.userId,
      questionId,
      input.review,
    );
    if (!binding) return this.published(input.slug);

    const question = await this.questions.findByIdForSession(binding);
    if (!question) return null;
    return { question, withdrawn: question.status !== 'published' };
  }

  private async published(slug: string): Promise<GetQuestionForViewOutput> {
    const question = await this.questions.findPublishedBySlug(slug);
    return question ? { question, withdrawn: false } : null;
  }

  // The learner's own answer under review, or null when they have none. Every
  // read is scoped to the learner, so another learner's ids resolve to null.
  private async reviewedBinding(
    userId: string,
    questionId: string,
    review: NonNullable<GetQuestionForViewInput['review']>,
  ): Promise<QuestionRevisionBinding | null> {
    if (review.attemptId) {
      const attempt = await this.attempts.findByIdAndUserId(
        review.attemptId,
        userId,
      );
      return attempt?.questionId === questionId ? attempt : null;
    }
    if (review.sessionId) {
      const session = await this.sessions.findByIdAndUserId(
        review.sessionId,
        userId,
      );
      // An active session's item is not a finished answer to review.
      if (!session || session.endedAt === null) return null;
      return (
        session.questionStates.find(
          (state) => state.questionId === questionId,
        ) ?? null
      );
    }
    return this.attempts.findLatestByUserAndQuestion(userId, questionId);
  }
}
