import {
  ApplicationConflictReasons,
  ApplicationError,
} from '@/src/application/errors';
import type {
  QuestionFeedbackRecordOptions,
  QuestionFeedbackRepository,
} from '@/src/application/ports/repositories';
import type {
  NewQuestionFeedback,
  QuestionFeedback,
  QuestionRatingFeedback,
  QuestionReportFeedback,
} from '@/src/domain/entities';

// Mirror the Drizzle adapter: a replayed row must correspond to the same
// logical request (same question and payload), or a typed conflict surfaces.
function assertReplayMatchesRequest(
  existing: QuestionFeedback,
  event: NewQuestionFeedback,
): void {
  const matches =
    existing.questionId === event.questionId &&
    (event.kind === 'rating'
      ? existing.kind === 'rating' && existing.rating === event.rating
      : existing.kind === 'report' &&
        existing.category === event.category &&
        existing.comment === event.comment);
  if (matches) return;

  throw new ApplicationError(
    'CONFLICT',
    'Feedback request token was reused with a different request',
    undefined,
    {
      details: { reason: ApplicationConflictReasons.FeedbackRequestReused },
    },
  );
}

export class FakeQuestionFeedbackRepository
  implements QuestionFeedbackRepository
{
  readonly recordCalls: NewQuestionFeedback[] = [];
  private events: QuestionFeedback[];
  private readonly eventsByRequestKey = new Map<string, QuestionFeedback>();

  constructor(
    seed: readonly QuestionFeedback[] = [],
    private readonly now: () => Date = () => new Date(),
    private readonly randomUuid: () => string = () => crypto.randomUUID(),
  ) {
    this.events = [...seed];
  }

  async record(
    event: NewQuestionFeedback,
    options?: QuestionFeedbackRecordOptions,
  ): Promise<QuestionFeedback> {
    this.recordCalls.push(event);

    const requestKey = options?.idempotencyKey
      ? `${event.userId}:${event.kind}:${options.idempotencyKey}`
      : null;
    if (requestKey) {
      const existing = this.eventsByRequestKey.get(requestKey);
      if (existing) {
        assertReplayMatchesRequest(existing, event);
        return existing;
      }
    }

    const persisted =
      event.kind === 'rating'
        ? this.persistRating(event)
        : this.persistReport(event);

    this.events = [...this.events, persisted];
    if (requestKey) this.eventsByRequestKey.set(requestKey, persisted);
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

    const [latest] = matching.slice().sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id);
    });
    return latest ?? null;
  }

  getAll(): readonly QuestionFeedback[] {
    return this.events;
  }

  private persistRating(
    event: Extract<NewQuestionFeedback, { kind: 'rating' }>,
  ): QuestionRatingFeedback {
    return {
      ...event,
      id: this.randomUuid(),
      createdAt: this.now(),
    };
  }

  private persistReport(
    event: Extract<NewQuestionFeedback, { kind: 'report' }>,
  ): QuestionReportFeedback {
    return {
      ...event,
      id: this.randomUuid(),
      createdAt: this.now(),
    };
  }
}
