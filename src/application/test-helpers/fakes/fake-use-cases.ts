import type {
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type { UseCase } from '@/src/application/ports/use-cases';
import type {
  CountAvailableQuestionsInput,
  CountAvailableQuestionsOutput,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  EndPracticeSessionInput,
  EndPracticeSessionOutput,
  GetAttemptedQuestionsInput,
  GetAttemptedQuestionsOutput,
  GetIncompletePracticeSessionInput,
  GetIncompletePracticeSessionOutput,
  GetNextQuestionInput,
  GetNextQuestionOutput,
  GetPracticeSessionReviewInput,
  GetPracticeSessionReviewOutput,
  GetSessionHistoryInput,
  GetSessionHistoryOutput,
  GetUserStatsInput,
  SetPracticeSessionQuestionMarkInput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionInput,
  StartPracticeSessionOutput,
  SubmitAnswerInput,
  SubmitAnswerOutput,
  ToggleBookmarkInput,
  ToggleBookmarkOutput,
  UserStatsOutput,
} from '@/src/application/use-cases';

export class FakeToggleBookmarkUseCase
  implements UseCase<ToggleBookmarkInput, ToggleBookmarkOutput>
{
  readonly inputs: ToggleBookmarkInput[] = [];

  constructor(
    private readonly output: ToggleBookmarkOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: ToggleBookmarkInput): Promise<ToggleBookmarkOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetBookmarksUseCase
  implements UseCase<GetBookmarksInput, GetBookmarksOutput>
{
  readonly inputs: GetBookmarksInput[] = [];

  constructor(
    private readonly output: GetBookmarksOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeStartPracticeSessionUseCase
  implements UseCase<StartPracticeSessionInput, StartPracticeSessionOutput>
{
  readonly inputs: StartPracticeSessionInput[] = [];

  constructor(
    private readonly output: StartPracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: StartPracticeSessionInput,
  ): Promise<StartPracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeCountAvailableQuestionsUseCase
  implements
    UseCase<CountAvailableQuestionsInput, CountAvailableQuestionsOutput>
{
  readonly inputs: CountAvailableQuestionsInput[] = [];

  constructor(
    private readonly output: CountAvailableQuestionsOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CountAvailableQuestionsInput,
  ): Promise<CountAvailableQuestionsOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeEndPracticeSessionUseCase
  implements UseCase<EndPracticeSessionInput, EndPracticeSessionOutput>
{
  readonly inputs: EndPracticeSessionInput[] = [];

  constructor(
    private readonly output: EndPracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: EndPracticeSessionInput,
  ): Promise<EndPracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeCreateCheckoutSessionUseCase
  implements UseCase<CreateCheckoutSessionInput, CreateCheckoutSessionOutput>
{
  readonly inputs: CreateCheckoutSessionInput[] = [];

  constructor(
    private readonly output: CreateCheckoutSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeCreatePortalSessionUseCase
  implements UseCase<CreatePortalSessionInput, CreatePortalSessionOutput>
{
  readonly inputs: CreatePortalSessionInput[] = [];

  constructor(
    private readonly output: CreatePortalSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreatePortalSessionInput,
  ): Promise<CreatePortalSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetAttemptedQuestionsUseCase
  implements UseCase<GetAttemptedQuestionsInput, GetAttemptedQuestionsOutput>
{
  readonly inputs: GetAttemptedQuestionsInput[] = [];

  constructor(
    private readonly output: GetAttemptedQuestionsOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetAttemptedQuestionsInput,
  ): Promise<GetAttemptedQuestionsOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetIncompletePracticeSessionUseCase
  implements
    UseCase<
      GetIncompletePracticeSessionInput,
      GetIncompletePracticeSessionOutput
    >
{
  readonly inputs: GetIncompletePracticeSessionInput[] = [];

  constructor(
    private readonly output: GetIncompletePracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetIncompletePracticeSessionInput,
  ): Promise<GetIncompletePracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetPracticeSessionReviewUseCase
  implements
    UseCase<GetPracticeSessionReviewInput, GetPracticeSessionReviewOutput>
{
  readonly inputs: GetPracticeSessionReviewInput[] = [];

  constructor(
    private readonly output: GetPracticeSessionReviewOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetPracticeSessionReviewInput,
  ): Promise<GetPracticeSessionReviewOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetSessionHistoryUseCase
  implements UseCase<GetSessionHistoryInput, GetSessionHistoryOutput>
{
  readonly inputs: GetSessionHistoryInput[] = [];

  constructor(
    private readonly output: GetSessionHistoryOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetSessionHistoryInput,
  ): Promise<GetSessionHistoryOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetUserStatsUseCase
  implements UseCase<GetUserStatsInput, UserStatsOutput>
{
  readonly inputs: GetUserStatsInput[] = [];

  constructor(
    private readonly output: UserStatsOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetUserStatsInput): Promise<UserStatsOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetNextQuestionUseCase
  implements UseCase<GetNextQuestionInput, GetNextQuestionOutput>
{
  readonly inputs: GetNextQuestionInput[] = [];

  constructor(
    private readonly output: GetNextQuestionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeSubmitAnswerUseCase
  implements UseCase<SubmitAnswerInput, SubmitAnswerOutput>
{
  readonly inputs: SubmitAnswerInput[] = [];

  constructor(
    private readonly output: SubmitAnswerOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeSetPracticeSessionQuestionMarkUseCase
  implements
    UseCase<
      SetPracticeSessionQuestionMarkInput,
      SetPracticeSessionQuestionMarkOutput
    >
{
  readonly inputs: SetPracticeSessionQuestionMarkInput[] = [];

  constructor(
    private readonly output: SetPracticeSessionQuestionMarkOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: SetPracticeSessionQuestionMarkInput,
  ): Promise<SetPracticeSessionQuestionMarkOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}
