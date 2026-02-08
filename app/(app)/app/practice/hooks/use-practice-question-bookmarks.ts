import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import {
  createBookmarksEffect,
  toggleBookmarkForQuestion,
} from '../practice-page-logic';
import { scheduleBookmarkMessageAutoClear } from './bookmark-message-timeout';

export type UsePracticeQuestionBookmarksInput = {
  question: NextQuestion | null;
  isMounted: () => boolean;
};

export type UsePracticeQuestionBookmarksOutput = {
  bookmarkStatus: 'idle' | 'loading' | 'error';
  bookmarkMessage: string | null;
  bookmarkMessageVersion: number;
  isBookmarked: boolean;
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
  const [bookmarkIdempotencyKey, setBookmarkIdempotencyKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    return createBookmarksEffect({
      bookmarkRetryCount,
      getBookmarksFn: getBookmarks,
      setBookmarkedQuestionIds,
      setBookmarkStatus,
      setBookmarkRetryCount,
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

  const onToggleBookmark = useMemo(
    () =>
      toggleBookmarkForQuestion.bind(null, {
        question: input.question,
        bookmarkIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
        setBookmarkIdempotencyKey,
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
        isMounted: input.isMounted,
      }),
    [bookmarkIdempotencyKey, input.question, input.isMounted],
  );

  return {
    bookmarkStatus,
    bookmarkMessage,
    bookmarkMessageVersion,
    isBookmarked,
    onToggleBookmark,
  };
}
