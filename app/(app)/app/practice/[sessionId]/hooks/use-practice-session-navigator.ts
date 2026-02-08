import { useEffect, useState } from 'react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type EndPracticeSessionOutput,
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createNavigatorEffect } from '../practice-session-page-logic';

export type UsePracticeSessionNavigatorInput = {
  summary: EndPracticeSessionOutput | null;
  isInReviewStage: boolean;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  questionId: string | null;
  submitResult: SubmitAnswerOutput | null;
  navigatorReloadCount: number;
  isMounted: () => boolean;
};

export type UsePracticeSessionNavigatorOutput = {
  navigator: GetPracticeSessionReviewOutput | null;
  navigatorLoadState: LoadState;
};

export function usePracticeSessionNavigator(
  input: UsePracticeSessionNavigatorInput,
): UsePracticeSessionNavigatorOutput {
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
      getPracticeSessionReviewFn: getPracticeSessionReview,
      setNavigator,
      setNavigatorLoadState,
      isMounted: input.isMounted,
    });
  }, [
    input.summary,
    input.isInReviewStage,
    input.sessionInfo,
    input.sessionId,
    input.questionId,
    input.submitResult,
    input.navigatorReloadCount,
    input.isMounted,
  ]);

  return {
    navigator,
    navigatorLoadState,
  };
}
