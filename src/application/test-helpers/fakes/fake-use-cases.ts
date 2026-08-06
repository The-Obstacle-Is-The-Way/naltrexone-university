import type { UseCase } from '@/src/application/ports/use-cases';
import type * as U from '@/src/application/use-cases';

export class FakeUseCase<I, O> implements UseCase<I, O> {
  readonly inputs: I[] = [];

  constructor(
    private readonly output: O,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: I): Promise<O> {
    this.inputs.push(input);
    if (this.toThrow !== undefined) throw this.toThrow;
    return this.output;
  }
}

export class FakeSetBookmarkUseCase extends FakeUseCase<
  U.SetBookmarkInput,
  U.SetBookmarkOutput
> {}
export class FakeRateQuestionUseCase extends FakeUseCase<
  U.RateQuestionInput,
  U.RateQuestionOutput
> {}
export class FakeGetQuestionRatingUseCase extends FakeUseCase<
  U.GetQuestionRatingInput,
  U.GetQuestionRatingOutput
> {}
export class FakeSubmitQuestionReportUseCase extends FakeUseCase<
  U.SubmitQuestionReportInput,
  U.SubmitQuestionReportOutput
> {}
export class FakeGetBookmarksUseCase extends FakeUseCase<
  U.GetBookmarksInput,
  U.GetBookmarksOutput
> {}
export class FakeGetBookmarkQuestionIdsUseCase extends FakeUseCase<
  U.GetBookmarkQuestionIdsInput,
  U.GetBookmarkQuestionIdsOutput
> {}
export class FakeGetBookmarkStatusUseCase extends FakeUseCase<
  U.GetBookmarkStatusInput,
  U.GetBookmarkStatusOutput
> {}
export class FakeStartPracticeSessionUseCase extends FakeUseCase<
  U.StartPracticeSessionInput,
  U.StartPracticeSessionOutput
> {}
export class FakeCountAvailableQuestionsUseCase extends FakeUseCase<
  U.CountAvailableQuestionsInput,
  U.CountAvailableQuestionsOutput
> {}
export class FakeDiscardPracticeSessionUseCase extends FakeUseCase<
  U.DiscardPracticeSessionInput,
  U.DiscardPracticeSessionOutput
> {}
export class FakeEndPracticeSessionUseCase extends FakeUseCase<
  U.EndPracticeSessionInput,
  U.EndPracticeSessionOutput
> {}
export class FakeFinalizeExamAnswersUseCase extends FakeUseCase<
  U.FinalizeExamAnswersInput,
  U.FinalizeExamAnswersOutput
> {}
export class FakeSaveExamDraftAnswerUseCase extends FakeUseCase<
  U.SaveExamDraftAnswerInput,
  U.SaveExamDraftAnswerOutput
> {}
export class FakeCreateCheckoutSessionUseCase extends FakeUseCase<
  U.CreateCheckoutSessionInput,
  U.CreateCheckoutSessionOutput
> {}
export class FakeCreatePortalSessionUseCase extends FakeUseCase<
  U.CreatePortalSessionInput,
  U.CreatePortalSessionOutput
> {}
export class FakeCreateTrialPaymentMethodSetupSessionUseCase extends FakeUseCase<
  U.CreateTrialPaymentMethodSetupSessionInput,
  U.CreateTrialPaymentMethodSetupSessionOutput
> {}
export class FakeGetAttemptedQuestionsUseCase extends FakeUseCase<
  U.GetAttemptedQuestionsInput,
  U.GetAttemptedQuestionsOutput
> {}
export class FakeGetIncompletePracticeSessionUseCase extends FakeUseCase<
  U.GetIncompletePracticeSessionInput,
  U.GetIncompletePracticeSessionOutput
> {}
export class FakeGetCompletedSessionQuestionsWithFeedbackUseCase extends FakeUseCase<
  U.GetCompletedSessionQuestionsWithFeedbackInput,
  U.GetCompletedSessionQuestionsWithFeedbackOutput
> {}
export class FakeGetPracticeSessionReviewUseCase extends FakeUseCase<
  U.GetPracticeSessionReviewInput,
  U.GetPracticeSessionReviewOutput
> {}
export class FakeGetPracticeSessionSummaryUseCase extends FakeUseCase<
  U.GetPracticeSessionSummaryInput,
  U.GetPracticeSessionSummaryOutput
> {}
export class FakeGetSessionHistoryUseCase extends FakeUseCase<
  U.GetSessionHistoryInput,
  U.GetSessionHistoryOutput
> {}
export class FakeGetUserStatsUseCase extends FakeUseCase<
  U.GetUserStatsInput,
  U.UserStatsOutput
> {}
export class FakeGetNextQuestionUseCase extends FakeUseCase<
  U.GetNextQuestionInput,
  U.GetNextQuestionOutput
> {}
export class FakeSubmitAnswerUseCase extends FakeUseCase<
  U.SubmitAnswerInput,
  U.SubmitAnswerOutput
> {}
export class FakeSetPracticeSessionQuestionMarkUseCase extends FakeUseCase<
  U.SetPracticeSessionQuestionMarkInput,
  U.SetPracticeSessionQuestionMarkOutput
> {}
export class FakeCheckEntitlementUseCase extends FakeUseCase<
  U.CheckEntitlementInput,
  U.CheckEntitlementOutput
> {}
