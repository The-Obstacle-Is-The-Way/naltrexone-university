import { useEffect, useRef, useState } from 'react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createNavigatorEffect } from '../practice-session-page-logic';

type SessionIdInput = { sessionId: string };

export type UsePracticeSessionNavigatorInput = {
  summary: EndPracticeSessionOutput | null;
  isInReviewStage: boolean;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  questionId: string | null;
  submitResult: SubmitAnswerOutput | null;
  navigatorReloadCount: number;
  getPracticeSessionReviewFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
  isMounted: () => boolean;
};

export type UsePracticeSessionNavigatorOutput = {
  navigator: GetPracticeSessionReviewOutput | null;
  navigatorLoadState: LoadState;
};

export function usePracticeSessionNavigator(
  input: UsePracticeSessionNavigatorInput,
): UsePracticeSessionNavigatorOutput {
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;

  const [navigator, setNavigator] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [navigatorLoadState, setNavigatorLoadState] = useState<LoadState>({
    status: 'idle',
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: navigator must refresh when the current question and answer state change.
  useEffect(() => {
    return createNavigatorEffect({
      summary: input.summary,
      isInReviewStage: input.isInReviewStage,
      sessionInfo: input.sessionInfo,
      sessionId: input.sessionId,
      getPracticeSessionReviewFn: input.getPracticeSessionReviewFn,
      setNavigator,
      setNavigatorLoadState,
      isMounted: () => isMountedRef.current(),
    });
  }, [
    input.summary,
    input.isInReviewStage,
    input.sessionInfo,
    input.sessionId,
    input.questionId,
    input.submitResult,
    input.navigatorReloadCount,
    input.getPracticeSessionReviewFn,
  ]);

  return {
    navigator,
    navigatorLoadState,
  };
}
