import { describe, expect, it } from 'vitest';
import { submitAnswerForQuestion as submitPracticeSessionAnswer } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { submitAnswerForQuestion as submitQuickPracticeAnswer } from '@/app/(app)/app/practice/practice-page-logic';
import type { RetryProvenance } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { submitSelectedAnswer } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { setBookmarkForQuestion } from '@/app/(app)/app/shared/bookmark-toggle';
import type { FingerprintBoundIdempotencyKey } from '@/app/(app)/app/shared/idempotency-request-key';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import {
  IdempotentActionNames,
  shouldCacheBookmarkError,
  shouldCacheSubmitAnswerError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';

const questionId = crypto.randomUUID();
const choiceAId = crypto.randomUUID();
const choiceBId = crypto.randomUUID();
const sessionAId = crypto.randomUUID();
const sessionBId = crypto.randomUUID();

type TokenCell = {
  current: FingerprintBoundIdempotencyKey | null;
};

type SubmitRequest = {
  questionId: string;
  choiceId: string;
  sessionId?: string;
  retryOfAttemptId?: string;
  retryOrigin?: string;
  retrySessionId?: string;
  idempotencyKey: string;
};

type BookmarkRequest = {
  questionId: string;
  bookmarked: boolean;
  idempotencyKey: string;
};

function createIdempotentServer<
  TRequest extends { idempotencyKey: string },
  TOutput,
>(input: {
  action: string;
  shouldCacheError: (error: unknown) => boolean;
  execute: (request: TRequest) => TOutput;
}) {
  const repo = new FakeIdempotencyKeyRepository();
  const logger = new FakeLogger();
  const executions: TRequest[] = [];

  return {
    executions,
    handle: (request: TRequest): Promise<TOutput> =>
      withIdempotency<TOutput>({
        repo,
        logger,
        userId: 'user-1',
        action: input.action,
        key: request.idempotencyKey,
        now: () => new Date(),
        shouldCacheError: input.shouldCacheError,
        execute: async () => {
          executions.push(request);
          return input.execute(request);
        },
      }),
  };
}

function createSubmitServer() {
  return createIdempotentServer<SubmitRequest, SubmitAnswerOutput>({
    action: IdempotentActionNames.SubmitAnswer,
    shouldCacheError: shouldCacheSubmitAnswerError,
    execute: (request) => ({
      attemptId: crypto.randomUUID(),
      isCorrect: request.choiceId === choiceAId,
      correctChoiceId: choiceAId,
      explanationMd: `Graded ${request.choiceId}`,
      referenceMd: null,
      choiceExplanations: [],
    }),
  });
}

const nextQuestion = createNextQuestion({
  questionId,
  choices: [
    {
      id: choiceAId,
      label: 'A',
      textMd: 'Choice A',
      sortOrder: 1,
    },
    {
      id: choiceBId,
      label: 'B',
      textMd: 'Choice B',
      sortOrder: 2,
    },
  ],
});

const standaloneQuestion = {
  questionId,
  slug: 'request-identity-question',
  stemMd: 'Question stem',
  difficulty: 'easy',
  choices: [
    { id: choiceAId, label: 'A', textMd: 'Choice A' },
    { id: choiceBId, label: 'B', textMd: 'Choice B' },
  ],
} satisfies GetQuestionBySlugOutput;

type SubmitSurface = (input: {
  choiceId: string;
  tokenCell: TokenCell;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
}) => Promise<SubmitAnswerOutput | null>;

const submitQuickPracticeSurface: SubmitSurface = async (input) => {
  let submitted: SubmitAnswerOutput | null = null;
  await submitQuickPracticeAnswer({
    question: nextQuestion,
    selectedChoiceId: input.choiceId,
    questionLoadedAtMs: 0,
    submitRequestToken: input.tokenCell.current,
    createIdempotencyKey: () => crypto.randomUUID(),
    setSubmitRequestToken: (token) => {
      input.tokenCell.current = token;
    },
    submitAnswerFn: input.submitAnswerFn,
    nowMs: () => 1_000,
    setLoadState: () => undefined,
    setSubmitResult: (result) => {
      submitted = result;
    },
  });
  return submitted;
};

function createPracticeSessionSurface(sessionId: string): SubmitSurface {
  return async (input) => {
    let submitted: SubmitAnswerOutput | null = null;
    await submitPracticeSessionAnswer({
      sessionId,
      question: nextQuestion,
      selectedChoiceId: input.choiceId,
      questionLoadedAtMs: 0,
      submitRequestToken: input.tokenCell.current,
      createIdempotencyKey: () => crypto.randomUUID(),
      setSubmitRequestToken: (token) => {
        input.tokenCell.current = token;
      },
      submitAnswerFn: input.submitAnswerFn,
      nowMs: () => 1_000,
      setLoadState: () => undefined,
      setSubmitResult: (result) => {
        submitted = result;
      },
    });
    return submitted;
  };
}

function createStandaloneSurface(
  retryProvenance: RetryProvenance | null = null,
): SubmitSurface {
  return async (input) => {
    let submitted: SubmitAnswerOutput | null = null;
    await submitSelectedAnswer({
      question: standaloneQuestion,
      selectedChoiceId: input.choiceId,
      questionLoadedAtMs: 0,
      submitRequestToken: input.tokenCell.current,
      retryProvenance,
      createIdempotencyKey: () => crypto.randomUUID(),
      setSubmitRequestToken: (token) => {
        input.tokenCell.current = token;
      },
      submitAnswerFn: input.submitAnswerFn,
      nowMs: () => 1_000,
      setLoadState: () => undefined,
      setSubmitResult: (result) => {
        submitted = result;
      },
    });
    return submitted;
  };
}

async function loseSubmitResponse(
  surface: SubmitSurface,
  server: ReturnType<typeof createSubmitServer>,
  tokenCell: TokenCell,
  choiceId: string,
): Promise<void> {
  await surface({
    choiceId,
    tokenCell,
    submitAnswerFn: async (rawInput) => {
      await server.handle(rawInput as SubmitRequest);
      throw new Error('response lost after commit');
    },
  });
}

async function receiveSubmitResponse(
  surface: SubmitSurface,
  server: ReturnType<typeof createSubmitServer>,
  tokenCell: TokenCell,
  choiceId: string,
): Promise<SubmitAnswerOutput | null> {
  return surface({
    choiceId,
    tokenCell,
    submitAnswerFn: async (rawInput) =>
      ok(await server.handle(rawInput as SubmitRequest)),
  });
}

describe.each([
  ['Quick Practice submit', submitQuickPracticeSurface],
  ['practice-session submit', createPracticeSessionSurface(sessionAId)],
  ['standalone question-page submit', createStandaloneSurface()],
] as const)('%s request identity across the real idempotency wrapper', (_, surface) => {
  it('replays a same-choice lost response and retires the consumed key', async () => {
    const server = createSubmitServer();
    const tokenCell: TokenCell = { current: null };

    await loseSubmitResponse(surface, server, tokenCell, choiceAId);
    const preservedKey = tokenCell.current?.key;
    const result = await receiveSubmitResponse(
      surface,
      server,
      tokenCell,
      choiceAId,
    );

    expect(preservedKey).toBeTypeOf('string');
    expect(server.executions).toHaveLength(1);
    expect(result?.isCorrect).toBe(true);
    expect(tokenCell.current).toBeNull();
  });

  it('executes a changed choice under a fresh key instead of replaying the old grade', async () => {
    const server = createSubmitServer();
    const tokenCell: TokenCell = { current: null };

    await loseSubmitResponse(surface, server, tokenCell, choiceAId);
    const oldKey = tokenCell.current?.key;
    const result = await receiveSubmitResponse(
      surface,
      server,
      tokenCell,
      choiceBId,
    );

    expect(server.executions).toHaveLength(2);
    expect(server.executions.map((request) => request.choiceId)).toEqual([
      choiceAId,
      choiceBId,
    ]);
    expect(server.executions[1]?.idempotencyKey).not.toBe(oldKey);
    expect(result?.isCorrect).toBe(false);
    expect(result?.explanationMd).toBe(`Graded ${choiceBId}`);
    expect(tokenCell.current).toBeNull();
  });
});

describe('submit identity context', () => {
  it('binds an active-session submit key to the session id', async () => {
    const server = createSubmitServer();
    const tokenCell: TokenCell = { current: null };

    await loseSubmitResponse(
      createPracticeSessionSurface(sessionAId),
      server,
      tokenCell,
      choiceAId,
    );
    const oldKey = tokenCell.current?.key;
    await receiveSubmitResponse(
      createPracticeSessionSurface(sessionBId),
      server,
      tokenCell,
      choiceAId,
    );

    expect(server.executions).toHaveLength(2);
    expect(server.executions.map((request) => request.sessionId)).toEqual([
      sessionAId,
      sessionBId,
    ]);
    expect(server.executions[1]?.idempotencyKey).not.toBe(oldKey);
  });

  it('binds a standalone submit key to deliberate retry provenance', async () => {
    const server = createSubmitServer();
    const tokenCell: TokenCell = { current: null };
    const retryProvenance: RetryProvenance = {
      retryOfAttemptId: crypto.randomUUID(),
      retryOrigin: 'history',
      retrySessionId: null,
    };

    await loseSubmitResponse(
      createStandaloneSurface(),
      server,
      tokenCell,
      choiceAId,
    );
    const oldKey = tokenCell.current?.key;
    await receiveSubmitResponse(
      createStandaloneSurface(retryProvenance),
      server,
      tokenCell,
      choiceAId,
    );

    expect(server.executions).toHaveLength(2);
    expect(server.executions[1]).toMatchObject({
      retryOfAttemptId: retryProvenance.retryOfAttemptId,
      retryOrigin: retryProvenance.retryOrigin,
    });
    expect(server.executions[1]?.idempotencyKey).not.toBe(oldKey);
  });
});

describe('bookmark request identity across the real idempotency wrapper', () => {
  function createBookmarkServer() {
    return createIdempotentServer<BookmarkRequest, { bookmarked: boolean }>({
      action: IdempotentActionNames.Bookmark,
      shouldCacheError: shouldCacheBookmarkError,
      execute: (request) => ({ bookmarked: request.bookmarked }),
    });
  }

  async function toggleBookmark(input: {
    desiredBookmarked: boolean;
    tokenCell: TokenCell;
    server: ReturnType<typeof createBookmarkServer>;
    loseResponse?: boolean;
  }): Promise<void> {
    await setBookmarkForQuestion({
      question: { questionId },
      desiredBookmarked: input.desiredBookmarked,
      bookmarkRequestToken: input.tokenCell.current,
      createIdempotencyKey: () => crypto.randomUUID(),
      setBookmarkRequestToken: (token) => {
        input.tokenCell.current = token;
      },
      setBookmarkFn: async (rawInput) => {
        const result = await input.server.handle(rawInput as BookmarkRequest);
        if (input.loseResponse) throw new Error('response lost after commit');
        return ok(result);
      },
      setBookmarkStatus: () => undefined,
      setBookmarkedQuestionIds: () => undefined,
    });
  }

  it('replays the same desired state and retires the consumed key', async () => {
    const server = createBookmarkServer();
    const tokenCell: TokenCell = { current: null };

    await toggleBookmark({
      desiredBookmarked: true,
      tokenCell,
      server,
      loseResponse: true,
    });
    const preservedKey = tokenCell.current?.key;
    await toggleBookmark({ desiredBookmarked: true, tokenCell, server });

    expect(preservedKey).toBeTypeOf('string');
    expect(server.executions).toHaveLength(1);
    expect(tokenCell.current).toBeNull();
  });

  it('executes the opposite desired state under a fresh key', async () => {
    const server = createBookmarkServer();
    const tokenCell: TokenCell = { current: null };

    await toggleBookmark({
      desiredBookmarked: true,
      tokenCell,
      server,
      loseResponse: true,
    });
    const oldKey = tokenCell.current?.key;
    await toggleBookmark({ desiredBookmarked: false, tokenCell, server });

    expect(server.executions).toHaveLength(2);
    expect(server.executions.map((request) => request.bookmarked)).toEqual([
      true,
      false,
    ]);
    expect(server.executions[1]?.idempotencyKey).not.toBe(oldKey);
    expect(tokenCell.current).toBeNull();
  });
});
