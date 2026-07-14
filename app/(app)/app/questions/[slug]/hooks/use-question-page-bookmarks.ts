import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type BookmarkRequestToken,
  setBookmarkForQuestion,
} from '@/app/(app)/app/shared/bookmark-toggle';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import type { QuestionMode } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import {
  getBookmarks,
  setBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import { STANDARD_READ_TIMEOUT_MS } from '../../../shared/timeout-tiers';

const BOOKMARK_LOOKUP_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

export type QuestionPageBookmarkStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'error';

export type UseQuestionPageBookmarksInput = {
  mode?: QuestionMode | null | undefined;
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
  const bookmarkRequestTokensRef = useRef<Map<string, BookmarkRequestToken>>(
    new Map(),
  );
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
      const desiredBookmarked = !isBookmarked;

      void setBookmarkForQuestion({
        question: input.question,
        desiredBookmarked,
        bookmarkRequestToken:
          bookmarkRequestTokensRef.current.get(questionId) ?? null,
        createIdempotencyKey: () => crypto.randomUUID(),
        setBookmarkRequestToken: (token) => {
          if (token) {
            bookmarkRequestTokensRef.current.set(questionId, token);
          } else {
            bookmarkRequestTokensRef.current.delete(questionId);
          }
        },
        setBookmarkFn: setBookmark,
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
            action: 'setBookmark',
          });
        },
        isMounted: () => isMountedRef.current(),
      });
    };
  }, [input.question, isBookmarked]);

  return {
    bookmarkStatus,
    isBookmarkHydrated,
    isBookmarked,
    onToggleBookmark,
  };
}
