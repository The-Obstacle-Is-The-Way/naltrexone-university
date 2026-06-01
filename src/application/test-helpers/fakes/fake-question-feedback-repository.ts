import type { QuestionFeedbackRepository } from '@/src/application/ports/repositories';
import type {
  NewQuestionFeedback,
  QuestionFeedback,
  QuestionRatingFeedback,
  QuestionReportFeedback,
} from '@/src/domain/entities';

export class FakeQuestionFeedbackRepository
  implements QuestionFeedbackRepository
{
  readonly recordCalls: NewQuestionFeedback[] = [];
  private events: QuestionFeedback[];

  constructor(
    seed: readonly QuestionFeedback[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.events = [...seed];
  }

  async record(event: NewQuestionFeedback): Promise<QuestionFeedback> {
    this.recordCalls.push(event);

    const persisted =
      event.kind === 'rating'
        ? this.persistRating(event)
        : this.persistReport(event);

    this.events = [...this.events, persisted];
    return persisted;
  }

  async findLatestRatingByUser(
    userId: string,
    questionId: string,
  ): Promise<QuestionRatingFeedback | null> {
    const matching = this.events.filter(
      (event): event is QuestionRatingFeedback =>
        event.kind === 'rating' &&
        event.userId === userId &&
        event.questionId === questionId,
    );
    if (matching.length === 0) return null;

    return matching.slice().sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id);
    })[0];
  }

  private persistRating(
    event: Extract<NewQuestionFeedback, { kind: 'rating' }>,
  ): QuestionRatingFeedback {
    return {
      ...event,
      id: crypto.randomUUID(),
      createdAt: this.now(),
    };
  }

  private persistReport(
    event: Extract<NewQuestionFeedback, { kind: 'report' }>,
  ): QuestionReportFeedback {
    return {
      ...event,
      id: crypto.randomUUID(),
      createdAt: this.now(),
    };
  }
}
