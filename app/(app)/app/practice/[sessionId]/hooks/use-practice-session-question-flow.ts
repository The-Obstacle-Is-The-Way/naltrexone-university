import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  createLoadNextQuestionAction,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import {
  canSubmitAnswer,
  type LoadState,
  selectChoiceIfAllowed,
} from '@/app/(app)/app/practice/practice-page-logic';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeSessionQuestionFlowInput = {
  sessionId: string;
  isMounted: () => boolean;
};

export type UsePracticeSessionQuestionFlowOutput = {
  sessionInfo: NextQuestion['session'];
  setSessionInfo: Dispatch<SetStateAction<NextQuestion['session']>>;
  sessionMode: 'tutor' | 'exam' | null;
  setSessionMode: Dispatch<SetStateAction<'tutor' | 'exam' | null>>;
  loadState: LoadState;
  setLoadState: Dispatch<SetStateAction<LoadState>>;
  question: NextQuestion | null;
  setQuestion: Dispatch<SetStateAction<NextQuestion | null>>;
  selectedChoiceId: string | null;
  setSelectedChoiceId: Dispatch<SetStateAction<string | null>>;
  submitResult: SubmitAnswerOutput | null;
  setSubmitResult: Dispatch<SetStateAction<SubmitAnswerOutput | null>>;
  isPending: boolean;
  canSubmit: boolean;
  onTryAgain: () => void;
  onNextQuestion: () => void;
  onNavigateQuestion: (questionId: string) => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => Promise<void>;
};

export function usePracticeSessionQuestionFlow(
  input: UsePracticeSessionQuestionFlowInput,
): UsePracticeSessionQuestionFlowOutput {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam' | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const latestQuestionRequestId = useRef(0);

  const createIdempotencyKey = useCallback(() => crypto.randomUUID(), []);

  const createRequestSequenceId = useCallback(() => {
    latestQuestionRequestId.current += 1;
    return latestQuestionRequestId.current;
  }, []);

  const isLatestRequest = useCallback(
    (requestId: number) => requestId === latestQuestionRequestId.current,
    [],
  );

  const loadQuestionConfig = useMemo(
    () => ({
      sessionId: input.sessionId,
      getNextQuestionFn: getNextQuestion,
      createIdempotencyKey,
      nowMs: Date.now,
      setLoadState,
      setSelectedChoiceId,
      setSubmitResult,
      setSubmitIdempotencyKey,
      setQuestionLoadedAt,
      setQuestion,
      setSessionInfo,
      createRequestSequenceId,
      isLatestRequest,
      isMounted: input.isMounted,
    }),
    [
      input.sessionId,
      input.isMounted,
      createIdempotencyKey,
      createRequestSequenceId,
      isLatestRequest,
    ],
  );

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        ...loadQuestionConfig,
      }),
    [loadQuestionConfig],
  );

  // Load the first question on mount and whenever the sessionId changes.
  useEffect(onTryAgain, [onTryAgain]);

  useEffect(() => {
    if (!sessionInfo?.mode) return;
    setSessionMode(sessionInfo.mode);
  }, [sessionInfo?.mode]);

  const onNavigateQuestion = useCallback(
    (questionId: string): void => {
      startTransition(() => {
        void loadNextQuestion({
          ...loadQuestionConfig,
          questionId,
        });
      });
    },
    [loadQuestionConfig],
  );

  const canSubmit = useMemo(() => {
    return canSubmitAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const onSubmit = useCallback(() => {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        await submitAnswerForQuestion({
          sessionId: input.sessionId,
          question,
          selectedChoiceId,
          questionLoadedAtMs: questionLoadedAt,
          submitIdempotencyKey,
          submitAnswerFn: submitAnswer,
          nowMs: Date.now,
          setLoadState,
          setSubmitResult,
          isMounted: input.isMounted,
        });
        resolve();
      });
    });
  }, [
    question,
    questionLoadedAt,
    selectedChoiceId,
    input.sessionId,
    submitIdempotencyKey,
    input.isMounted,
  ]);

  const onSelectChoice = useCallback(
    (choiceId: string) => {
      selectChoiceIfAllowed(submitResult, setSelectedChoiceId, choiceId);
    },
    [submitResult],
  );

  return {
    sessionInfo,
    setSessionInfo,
    sessionMode,
    setSessionMode,
    loadState,
    setLoadState,
    question,
    setQuestion,
    selectedChoiceId,
    setSelectedChoiceId,
    submitResult,
    setSubmitResult,
    isPending,
    canSubmit,
    onTryAgain,
    onNextQuestion: onTryAgain,
    onNavigateQuestion,
    onSelectChoice,
    onSubmit,
  };
}
