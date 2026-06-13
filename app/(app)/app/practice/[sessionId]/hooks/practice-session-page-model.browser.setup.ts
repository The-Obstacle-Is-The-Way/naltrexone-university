import { vi } from 'vitest';

type PracticeSessionPageModelBrowserMocks = {
  getNextQuestionMock: ReturnType<typeof vi.fn>;
  submitAnswerMock: ReturnType<typeof vi.fn>;
  getBookmarksMock: ReturnType<typeof vi.fn>;
  toggleBookmarkMock: ReturnType<typeof vi.fn>;
  getPracticeSessionReviewMock: ReturnType<typeof vi.fn>;
  getCompletedSessionQuestionsWithFeedbackMock: ReturnType<typeof vi.fn>;
  getPracticeSessionSummaryMock: ReturnType<typeof vi.fn>;
  endPracticeSessionMock: ReturnType<typeof vi.fn>;
  finalizeExamAnswersMock: ReturnType<typeof vi.fn>;
  saveExamDraftAnswerMock: ReturnType<typeof vi.fn>;
  setPracticeSessionQuestionMarkMock: ReturnType<typeof vi.fn>;
};

const practiceSessionPageModelBrowserMocks =
  vi.hoisted<PracticeSessionPageModelBrowserMocks>(() => ({
    getNextQuestionMock: vi.fn(),
    submitAnswerMock: vi.fn(),
    getBookmarksMock: vi.fn(),
    toggleBookmarkMock: vi.fn(),
    getPracticeSessionReviewMock: vi.fn(),
    getCompletedSessionQuestionsWithFeedbackMock: vi.fn(),
    getPracticeSessionSummaryMock: vi.fn(),
    endPracticeSessionMock: vi.fn(),
    finalizeExamAnswersMock: vi.fn(),
    saveExamDraftAnswerMock: vi.fn(),
    setPracticeSessionQuestionMarkMock: vi.fn(),
  }));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  getNextQuestion: practiceSessionPageModelBrowserMocks.getNextQuestionMock,
  submitAnswer: practiceSessionPageModelBrowserMocks.submitAnswerMock,
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: practiceSessionPageModelBrowserMocks.getBookmarksMock,
  toggleBookmark: practiceSessionPageModelBrowserMocks.toggleBookmarkMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview:
    practiceSessionPageModelBrowserMocks.getPracticeSessionReviewMock,
  getCompletedSessionQuestionsWithFeedback:
    practiceSessionPageModelBrowserMocks.getCompletedSessionQuestionsWithFeedbackMock,
  getPracticeSessionSummary:
    practiceSessionPageModelBrowserMocks.getPracticeSessionSummaryMock,
  endPracticeSession:
    practiceSessionPageModelBrowserMocks.endPracticeSessionMock,
  finalizeExamAnswers:
    practiceSessionPageModelBrowserMocks.finalizeExamAnswersMock,
  saveExamDraftAnswer:
    practiceSessionPageModelBrowserMocks.saveExamDraftAnswerMock,
  setPracticeSessionQuestionMark:
    practiceSessionPageModelBrowserMocks.setPracticeSessionQuestionMarkMock,
}));

export function getPracticeSessionPageModelBrowserMocks() {
  return practiceSessionPageModelBrowserMocks;
}

export function resetPracticeSessionPageModelBrowserMocks() {
  for (const mock of Object.values(practiceSessionPageModelBrowserMocks)) {
    if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  }
}
