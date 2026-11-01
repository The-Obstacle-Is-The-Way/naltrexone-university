import * as bookmarkActions from '@/src/adapters/controllers/bookmark-actions';
import * as practiceActions from '@/src/adapters/controllers/practice-actions';
import * as questionActions from '@/src/adapters/controllers/question-actions';
import * as questionFeedbackActions from '@/src/adapters/controllers/question-feedback-actions';
import * as questionViewActions from '@/src/adapters/controllers/question-view-actions';
import * as tagActions from '@/src/adapters/controllers/tag-actions';
import { redirectOnUnsubscribed } from './redirect-on-unsubscribed';

// BUG-365: the server actions app pages call. Each leaves for Pricing when it
// finds no subscription; tests/app-client-action-imports.test.ts keeps app code
// from importing the actions directly. Each call reads its module at call time,
// so test spies on the action modules still apply.

export const startPracticeSession = redirectOnUnsubscribed((input) =>
  practiceActions.startPracticeSession(input),
);
export const countAvailableQuestions = redirectOnUnsubscribed((input) =>
  practiceActions.countAvailableQuestions(input),
);
export const getIncompletePracticeSession = redirectOnUnsubscribed((input) =>
  practiceActions.getIncompletePracticeSession(input),
);
export const getCompletedSessionQuestionsWithFeedback = redirectOnUnsubscribed(
  (input) => practiceActions.getCompletedSessionQuestionsWithFeedback(input),
);
export const endPracticeSession = redirectOnUnsubscribed((input) =>
  practiceActions.endPracticeSession(input),
);
export const discardPracticeSession = redirectOnUnsubscribed((input) =>
  practiceActions.discardPracticeSession(input),
);
export const finalizeExamAnswers = redirectOnUnsubscribed((input) =>
  practiceActions.finalizeExamAnswers(input),
);
export const getPracticeSessionReview = redirectOnUnsubscribed((input) =>
  practiceActions.getPracticeSessionReview(input),
);
export const saveExamDraftAnswer = redirectOnUnsubscribed((input) =>
  practiceActions.saveExamDraftAnswer(input),
);
export const getPracticeSessionSummary = redirectOnUnsubscribed((input) =>
  practiceActions.getPracticeSessionSummary(input),
);
export const getPracticeSessionTiming = redirectOnUnsubscribed((input) =>
  practiceActions.getPracticeSessionTiming(input),
);
export const setPracticeSessionQuestionMark = redirectOnUnsubscribed((input) =>
  practiceActions.setPracticeSessionQuestionMark(input),
);

export const getNextQuestion = redirectOnUnsubscribed((input) =>
  questionActions.getNextQuestion(input),
);
export const submitAnswer = redirectOnUnsubscribed((input) =>
  questionActions.submitAnswer(input),
);

export const setBookmark = redirectOnUnsubscribed((input) =>
  bookmarkActions.setBookmark(input),
);
export const getBookmarkQuestionIds = redirectOnUnsubscribed((input) =>
  bookmarkActions.getBookmarkQuestionIds(input),
);
export const getBookmarkStatus = redirectOnUnsubscribed((input) =>
  bookmarkActions.getBookmarkStatus(input),
);

export const rateQuestion = redirectOnUnsubscribed((input) =>
  questionFeedbackActions.rateQuestion(input),
);
export const getQuestionRating = redirectOnUnsubscribed((input) =>
  questionFeedbackActions.getQuestionRating(input),
);
export const submitQuestionReport = redirectOnUnsubscribed((input) =>
  questionFeedbackActions.submitQuestionReport(input),
);

export const getTags = redirectOnUnsubscribed((input) =>
  tagActions.getTags(input),
);

export const getQuestionBySlug = redirectOnUnsubscribed((input) =>
  questionViewActions.getQuestionBySlug(input),
);
export const getPreviousAttempt = redirectOnUnsubscribed((input) =>
  questionViewActions.getPreviousAttempt(input),
);
