import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleBookmarkMessageAutoClear } from '@/app/(app)/app/practice/hooks/bookmark-message-timeout';
import {
  createBookmarksEffect,
  toggleBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';

export type UsePracticeQuestionBookmarksInput = {
  question: NextQuestion | null;
  isMounted: () => boolean;
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
  const bookmarkIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return createBookmarksEffect({
      bookmarkRetryCount,
      getBookmarksFn: getBookmarks,
      setBookmarkedQuestionIds,
      setBookmarkStatus,
      setBookmarkRetryCount,
      logError: (message: string, context: unknown) => {
        console.error('createBookmarksEffect failed:', message, context);
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
    await toggleBookmarkForQuestion({
      question: input.question,
      bookmarkIdempotencyKey: bookmarkIdempotencyKeyRef.current,
      createIdempotencyKey: () => crypto.randomUUID(),
      setBookmarkIdempotencyKey: (key) => {
        bookmarkIdempotencyKeyRef.current = key;
      },
      toggleBookmarkFn: toggleBookmark,
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
      isMounted: input.isMounted,
    });
  }, [input.question, input.isMounted]);

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
