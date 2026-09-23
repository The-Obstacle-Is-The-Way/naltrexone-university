import { vi } from 'vitest';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';

vi.mock('@/src/adapters/controllers/question-controller', { spy: true });
vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });

const practiceSessionPageModelBrowserMocks = {
  getNextQuestionMock: vi.mocked(questionController.getNextQuestion),
  submitAnswerMock: vi.mocked(questionController.submitAnswer),
  getBookmarkQuestionIdsMock: vi.mocked(
    bookmarkController.getBookmarkQuestionIds,
  ),
  setBookmarkMock: vi.mocked(bookmarkController.setBookmark),
  getPracticeSessionReviewMock: vi.mocked(
    practiceController.getPracticeSessionReview,
  ),
  getCompletedSessionQuestionsWithFeedbackMock: vi.mocked(
    practiceController.getCompletedSessionQuestionsWithFeedback,
  ),
  getPracticeSessionSummaryMock: vi.mocked(
    practiceController.getPracticeSessionSummary,
  ),
  endPracticeSessionMock: vi.mocked(practiceController.endPracticeSession),
  finalizeExamAnswersMock: vi.mocked(practiceController.finalizeExamAnswers),
  saveExamDraftAnswerMock: vi.mocked(practiceController.saveExamDraftAnswer),
  setPracticeSessionQuestionMarkMock: vi.mocked(
    practiceController.setPracticeSessionQuestionMark,
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
