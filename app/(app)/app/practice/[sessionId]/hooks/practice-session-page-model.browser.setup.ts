import { vi } from 'vitest';
import * as bookmarkActions from '@/src/adapters/controllers/bookmark-actions';
import * as practiceActions from '@/src/adapters/controllers/practice-actions';
import * as questionActions from '@/src/adapters/controllers/question-actions';

vi.mock('@/src/adapters/controllers/question-actions', { spy: true });
vi.mock('@/src/adapters/controllers/bookmark-actions', { spy: true });
vi.mock('@/src/adapters/controllers/practice-actions', { spy: true });

const practiceSessionPageModelBrowserMocks = {
  getNextQuestionMock: vi.mocked(questionActions.getNextQuestion),
  submitAnswerMock: vi.mocked(questionActions.submitAnswer),
  getBookmarkQuestionIdsMock: vi.mocked(bookmarkActions.getBookmarkQuestionIds),
  setBookmarkMock: vi.mocked(bookmarkActions.setBookmark),
  getPracticeSessionReviewMock: vi.mocked(
    practiceActions.getPracticeSessionReview,
  ),
  getCompletedSessionQuestionsWithFeedbackMock: vi.mocked(
    practiceActions.getCompletedSessionQuestionsWithFeedback,
  ),
  getPracticeSessionSummaryMock: vi.mocked(
    practiceActions.getPracticeSessionSummary,
  ),
  endPracticeSessionMock: vi.mocked(practiceActions.endPracticeSession),
  finalizeExamAnswersMock: vi.mocked(practiceActions.finalizeExamAnswers),
  saveExamDraftAnswerMock: vi.mocked(practiceActions.saveExamDraftAnswer),
  setPracticeSessionQuestionMarkMock: vi.mocked(
    practiceActions.setPracticeSessionQuestionMark,
  ),
};

export function getPracticeSessionPageModelBrowserMocks() {
  return practiceSessionPageModelBrowserMocks;
}

export function resetPracticeSessionPageModelBrowserMocks() {
  for (const mock of Object.values(practiceSessionPageModelBrowserMocks)) {
    mock.mockReset();
  }
}
