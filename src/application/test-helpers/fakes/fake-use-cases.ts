import type * as B from '@/src/application/ports/bookmarks';
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
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeToggleBookmarkUseCase extends FakeUseCase<
  U.ToggleBookmarkInput,
  U.ToggleBookmarkOutput
> {}
export class FakeGetBookmarksUseCase extends FakeUseCase<
  B.GetBookmarksInput,
  B.GetBookmarksOutput
> {}
export class FakeStartPracticeSessionUseCase extends FakeUseCase<
  U.StartPracticeSessionInput,
  U.StartPracticeSessionOutput
> {}
export class FakeCountAvailableQuestionsUseCase extends FakeUseCase<
  U.CountAvailableQuestionsInput,
  U.CountAvailableQuestionsOutput
> {}
export class FakeEndPracticeSessionUseCase extends FakeUseCase<
  U.EndPracticeSessionInput,
  U.EndPracticeSessionOutput
> {}
export class FakeCreateCheckoutSessionUseCase extends FakeUseCase<
  U.CreateCheckoutSessionInput,
  U.CreateCheckoutSessionOutput
> {}
export class FakeCreatePortalSessionUseCase extends FakeUseCase<
  U.CreatePortalSessionInput,
  U.CreatePortalSessionOutput
> {}
export class FakeGetAttemptedQuestionsUseCase extends FakeUseCase<
  U.GetAttemptedQuestionsInput,
  U.GetAttemptedQuestionsOutput
> {}
export class FakeGetIncompletePracticeSessionUseCase extends FakeUseCase<
  U.GetIncompletePracticeSessionInput,
  U.GetIncompletePracticeSessionOutput
> {}
export class FakeGetPracticeSessionReviewUseCase extends FakeUseCase<
  U.GetPracticeSessionReviewInput,
  U.GetPracticeSessionReviewOutput
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
