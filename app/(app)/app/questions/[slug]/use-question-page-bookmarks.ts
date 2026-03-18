import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleBookmarkForQuestion } from '@/app/(app)/app/shared/bookmark-toggle';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import type { QuestionMode } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';

const BOOKMARK_LOOKUP_TIMEOUT_MS = 10_000;

export type QuestionPageBookmarkStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'error';

export type UseQuestionPageBookmarksInput = {
  mode?: QuestionMode | null;
  question: GetQuestionBySlugOutput | null;
  isMounted: () => boolean;
};

export type UseQuestionPageBookmarksOutput = {
  bookmarkStatus: QuestionPageBookmarkStatus;
  isBookmarkHydrated: boolean;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
};

export function useQuestionPageBookmarks(
  input: UseQuestionPageBookmarksInput,
): UseQuestionPageBookmarksOutput {
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(() => new Set());
  const [bookmarkUiState, setBookmarkUiState] = useState<{
    questionId: string | null;
    status: QuestionPageBookmarkStatus;
    isHydrated: boolean;
  }>({
    questionId: null,
    status: input.mode === 'review' ? 'loading' : 'idle',
    isHydrated: false,
  });
  const latestBookmarkLookupRequestId = useRef(0);
  const bookmarkStateVersionRef = useRef(0);
  const bookmarkIdempotencyKeysRef = useRef<Map<string, string>>(new Map());
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;

  useEffect(() => {
    const isMounted = () => isMountedRef.current();

    if (input.mode !== 'review' || !input.question) {
      setBookmarkUiState((current) => {
        if (
          current.questionId === null &&
          current.status === 'idle' &&
          current.isHydrated === false
        ) {
          return current;
        }

        return {
          questionId: null,
          status: 'idle',
          isHydrated: false,
        };
      });
      return;
    }

    latestBookmarkLookupRequestId.current += 1;
    const requestId = latestBookmarkLookupRequestId.current;
    const questionId = input.question.questionId;
    bookmarkStateVersionRef.current += 1;
    const stateVersion = bookmarkStateVersionRef.current;

    setBookmarkUiState({
      questionId,
      status: 'loading',
      isHydrated: false,
    });
    setBookmarkedQuestionIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });

    void withTimeout(getBookmarks({}), BOOKMARK_LOOKUP_TIMEOUT_MS)
      .then((result) => {
        if (!isMounted()) return;
        if (latestBookmarkLookupRequestId.current !== requestId) return;
        if (bookmarkStateVersionRef.current !== stateVersion) return;

        if (!result.ok) {
          if (shouldReportClientError(result.error)) {
            reportClientError(result.error, {
              component: 'UseQuestionPageBookmarks',
              action: 'loadBookmarkState',
            });
          }
          setBookmarkUiState({
            questionId,
            status: 'error',
            isHydrated: false,
          });
          return;
        }

        const isQuestionBookmarked = result.data.rows.some(
          (row) => row.questionId === questionId,
        );

        setBookmarkedQuestionIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          if (isQuestionBookmarked) {
            next.add(questionId);
          }
          return next;
        });
        setBookmarkUiState({
          questionId,
          status: 'idle',
          isHydrated: true,
        });
      })
      .catch((error: unknown) => {
        if (!isMounted()) return;
        if (latestBookmarkLookupRequestId.current !== requestId) return;
        if (bookmarkStateVersionRef.current !== stateVersion) return;
        reportClientError(error, {
          component: 'UseQuestionPageBookmarks',
          action: 'loadBookmarkState',
        });
        setBookmarkUiState({
          questionId,
          status: 'error',
          isHydrated: false,
        });
      });
  }, [input.mode, input.question]);

  const isBookmarked = input.question
    ? bookmarkedQuestionIds.has(input.question.questionId)
    : false;
  const bookmarkStatus =
    input.mode === 'review' && input.question
      ? bookmarkUiState.questionId === input.question.questionId
        ? bookmarkUiState.status
        : 'loading'
      : 'idle';
  const isBookmarkHydrated =
    input.mode === 'review' &&
    input.question !== null &&
    bookmarkUiState.questionId === input.question.questionId &&
    bookmarkUiState.isHydrated;

  const onToggleBookmark = useMemo(() => {
    return () => {
      if (!input.question) return;

      bookmarkStateVersionRef.current += 1;
      const stateVersion = bookmarkStateVersionRef.current;
      const questionId = input.question.questionId;

      void toggleBookmarkForQuestion({
        question: input.question,
        bookmarkIdempotencyKey:
          bookmarkIdempotencyKeysRef.current.get(questionId) ?? null,
        createIdempotencyKey: () => crypto.randomUUID(),
        setBookmarkIdempotencyKey: (key) => {
          bookmarkIdempotencyKeysRef.current.set(questionId, key);
        },
        toggleBookmarkFn: toggleBookmark,
        setBookmarkStatus: (status) => {
          if (!isMountedRef.current()) return;
          if (bookmarkStateVersionRef.current !== stateVersion) return;

          setBookmarkUiState({
            questionId,
            status: status === 'loading' ? 'saving' : status,
            isHydrated: true,
          });
        },
        setBookmarkedQuestionIds,
        logError: (_message: string, error: unknown) => {
          reportClientError(error, {
            component: 'UseQuestionPageBookmarks',
            action: 'toggleBookmark',
          });
        },
        isMounted: () => isMountedRef.current(),
      });
    };
  }, [input.question]);

  return {
    bookmarkStatus,
    isBookmarkHydrated,
    isBookmarked,
    onToggleBookmark,
  };
}
