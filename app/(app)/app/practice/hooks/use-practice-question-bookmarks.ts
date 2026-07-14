import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleBookmarkMessageAutoClear } from '@/app/(app)/app/practice/hooks/bookmark-message-timeout';
import {
  createBookmarksEffect,
  setBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import type {
  BookmarkableQuestion,
  BookmarkRequestToken,
} from '@/app/(app)/app/shared/bookmark-toggle';
import { reportClientError } from '@/lib/report-client-error';
import {
  getBookmarks,
  setBookmark,
} from '@/src/adapters/controllers/bookmark-controller';

export type UsePracticeQuestionBookmarksInput = {
  question: BookmarkableQuestion | null;
  isMounted: () => boolean;
  onBookmarkToggled?: ((bookmarked: boolean) => void) | undefined;
};

export type UsePracticeQuestionBookmarksOutput = {
  bookmarkStatus: 'idle' | 'loading' | 'error';
  bookmarkMessage: string | null;
  bookmarkMessageVersion: number;
  isBookmarked: boolean;
  onRetryBookmarks: () => void;
  onToggleBookmark: () => Promise<void>;
};

export function usePracticeQuestionBookmarks(
  input: UsePracticeQuestionBookmarksInput,
): UsePracticeQuestionBookmarksOutput {
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<
    Set<string>
  >(() => new Set());
  const [bookmarkStatus, setBookmarkStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [bookmarkMessage, setBookmarkMessage] = useState<string | null>(null);
  const [bookmarkMessageVersion, setBookmarkMessageVersion] = useState(0);
  const bookmarkMessageTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);
  const bookmarkRequestTokensRef = useRef<Map<string, BookmarkRequestToken>>(
    new Map(),
  );

  useEffect(() => {
    return createBookmarksEffect({
      bookmarkRetryCount,
      getBookmarksFn: getBookmarks,
      setBookmarkedQuestionIds,
      setBookmarkStatus,
      setBookmarkRetryCount,
      logError: (_message: string, error: unknown) => {
        reportClientError(error, {
          component: 'UsePracticeQuestionBookmarks',
          action: 'loadBookmarks',
        });
      },
    });
  }, [bookmarkRetryCount]);

  useEffect(() => {
    return () => {
      if (bookmarkMessageTimeoutId.current) {
        clearTimeout(bookmarkMessageTimeoutId.current);
      }
    };
  }, []);

  const isBookmarked = input.question
    ? bookmarkedQuestionIds.has(input.question.questionId)
    : false;

  const onToggleBookmark = useCallback(async () => {
    const questionId = input.question?.questionId;
    const desiredBookmarked = !isBookmarked;

    await setBookmarkForQuestion({
      question: input.question,
      desiredBookmarked,
      bookmarkRequestToken: questionId
        ? (bookmarkRequestTokensRef.current.get(questionId) ?? null)
        : null,
      createIdempotencyKey: () => crypto.randomUUID(),
      setBookmarkRequestToken: (token) => {
        if (!questionId) return;
        if (token) {
          bookmarkRequestTokensRef.current.set(questionId, token);
        } else {
          bookmarkRequestTokensRef.current.delete(questionId);
        }
      },
      setBookmarkFn: setBookmark,
      setBookmarkStatus,
      setBookmarkedQuestionIds,
      onBookmarkToggled: (bookmarked: boolean) => {
        setBookmarkMessage(
          bookmarked ? 'Question bookmarked.' : 'Bookmark removed.',
        );
        setBookmarkMessageVersion((prev) => prev + 1);
        scheduleBookmarkMessageAutoClear({
          timeoutIdRef: bookmarkMessageTimeoutId,
          setBookmarkMessage,
          isMounted: input.isMounted,
        });
        input.onBookmarkToggled?.(bookmarked);
      },
      onBookmarkError: (message: string) => {
        setBookmarkMessage(message);
        setBookmarkMessageVersion((prev) => prev + 1);
        scheduleBookmarkMessageAutoClear({
          timeoutIdRef: bookmarkMessageTimeoutId,
          setBookmarkMessage,
          isMounted: input.isMounted,
        });
      },
      logError: (_message: string, error: unknown) => {
        reportClientError(error, {
          component: 'UsePracticeQuestionBookmarks',
          action: 'setBookmark',
        });
      },
      isMounted: input.isMounted,
    });
  }, [input.question, input.isMounted, input.onBookmarkToggled, isBookmarked]);

  const onRetryBookmarks = useCallback(() => {
    setBookmarkRetryCount((prev) => prev + 1);
  }, []);

  return {
    bookmarkStatus,
    bookmarkMessage,
    bookmarkMessageVersion,
    isBookmarked,
    onRetryBookmarks,
    onToggleBookmark,
  };
}
