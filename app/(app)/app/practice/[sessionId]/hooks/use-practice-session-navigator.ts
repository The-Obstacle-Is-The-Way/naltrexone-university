import { useEffect, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type EndPracticeSessionOutput,
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

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
    if (input.summary || input.isInReviewStage || !input.sessionInfo) {
      setNavigator(null);
      setNavigatorLoadState({ status: 'idle' });
      return;
    }

    let mounted = true;
    setNavigatorLoadState({ status: 'loading' });
    void (async () => {
      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId: input.sessionId });
      } catch (error) {
        if (!mounted || !input.isMounted()) return;
        setNavigator(null);
        setNavigatorLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!mounted || !input.isMounted()) return;
      if (!res.ok) {
        setNavigator(null);
        setNavigatorLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
        return;
      }
      setNavigator(res.data);
      setNavigatorLoadState({ status: 'ready' });
    })();

    return () => {
      mounted = false;
    };
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
