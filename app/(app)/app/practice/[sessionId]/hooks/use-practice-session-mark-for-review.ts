import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { setPracticeSessionQuestionMark } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

type UsePracticeSessionMarkForReviewInput = {
  question: NextQuestion | null;
  sessionMode: 'tutor' | 'exam' | null;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  setSessionInfo: Dispatch<SetStateAction<NextQuestion['session']>>;
  setLoadState: (state: LoadState) => void;
  setReview: Dispatch<SetStateAction<GetPracticeSessionReviewOutput | null>>;
  isMounted: () => boolean;
};

export function usePracticeSessionMarkForReview(
  input: UsePracticeSessionMarkForReviewInput,
): {
  isMarkingForReview: boolean;
  onToggleMarkForReview: () => Promise<void>;
} {
  const [isMarkingForReview, setIsMarkingForReview] = useState(false);
  const isMarkingRef = useRef(false);

  const onToggleMarkForReview = useCallback(async () => {
    if (!input.question) return;
    if (input.sessionMode !== 'exam') return;
    if (isMarkingRef.current) return;
    if (!input.sessionInfo) return;

    const markedForReview = !input.sessionInfo.isMarkedForReview;
    isMarkingRef.current = true;
    setIsMarkingForReview(true);

    let res: Awaited<ReturnType<typeof setPracticeSessionQuestionMark>>;
    try {
      res = await setPracticeSessionQuestionMark({
        sessionId: input.sessionId,
        questionId: input.question.questionId,
        markedForReview,
      });
    } catch (error) {
      if (!input.isMounted()) return;
      input.setLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
      isMarkingRef.current = false;
      setIsMarkingForReview(false);
      return;
    }
    if (!input.isMounted()) return;

    if (!res.ok) {
      input.setLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      isMarkingRef.current = false;
      setIsMarkingForReview(false);
      return;
    }

    input.setSessionInfo((prev) =>
      prev ? { ...prev, isMarkedForReview: res.data.markedForReview } : prev,
    );

    input.setReview((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row) => {
        if (row.questionId !== res.data.questionId) return row;
        return { ...row, markedForReview: res.data.markedForReview };
      });
      return {
        ...prev,
        rows,
        markedCount: rows.filter((row) => row.markedForReview).length,
      };
    });

    isMarkingRef.current = false;
    setIsMarkingForReview(false);
  }, [
    input.isMounted,
    input.question,
    input.sessionId,
    input.sessionInfo,
    input.sessionMode,
    input.setLoadState,
    input.setReview,
    input.setSessionInfo,
  ]);

  return { isMarkingForReview, onToggleMarkForReview };
}
