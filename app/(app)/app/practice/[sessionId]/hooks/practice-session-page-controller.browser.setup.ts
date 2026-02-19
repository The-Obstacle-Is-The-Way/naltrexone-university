import { vi } from 'vitest';

type PracticeSessionPageControllerBrowserMocks = {
  getNextQuestionMock: ReturnType<typeof vi.fn>;
  submitAnswerMock: ReturnType<typeof vi.fn>;
  getBookmarksMock: ReturnType<typeof vi.fn>;
  toggleBookmarkMock: ReturnType<typeof vi.fn>;
  getPracticeSessionReviewMock: ReturnType<typeof vi.fn>;
  endPracticeSessionMock: ReturnType<typeof vi.fn>;
  setPracticeSessionQuestionMarkMock: ReturnType<typeof vi.fn>;
};

const practiceSessionPageControllerBrowserMocks =
  vi.hoisted<PracticeSessionPageControllerBrowserMocks>(() => ({
    getNextQuestionMock: vi.fn(),
    submitAnswerMock: vi.fn(),
    getBookmarksMock: vi.fn(),
    toggleBookmarkMock: vi.fn(),
    getPracticeSessionReviewMock: vi.fn(),
    endPracticeSessionMock: vi.fn(),
    setPracticeSessionQuestionMarkMock: vi.fn(),
  }));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  getNextQuestion:
    practiceSessionPageControllerBrowserMocks.getNextQuestionMock,
  submitAnswer: practiceSessionPageControllerBrowserMocks.submitAnswerMock,
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: practiceSessionPageControllerBrowserMocks.getBookmarksMock,
  toggleBookmark: practiceSessionPageControllerBrowserMocks.toggleBookmarkMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview:
    practiceSessionPageControllerBrowserMocks.getPracticeSessionReviewMock,
  endPracticeSession:
    practiceSessionPageControllerBrowserMocks.endPracticeSessionMock,
  setPracticeSessionQuestionMark:
    practiceSessionPageControllerBrowserMocks.setPracticeSessionQuestionMarkMock,
}));

export function getPracticeSessionPageControllerBrowserMocks() {
  return practiceSessionPageControllerBrowserMocks;
}

export function resetPracticeSessionPageControllerBrowserMocks() {
  practiceSessionPageControllerBrowserMocks.getNextQuestionMock.mockReset();
  practiceSessionPageControllerBrowserMocks.submitAnswerMock.mockReset();
  practiceSessionPageControllerBrowserMocks.getBookmarksMock.mockReset();
  practiceSessionPageControllerBrowserMocks.toggleBookmarkMock.mockReset();
  practiceSessionPageControllerBrowserMocks.getPracticeSessionReviewMock.mockReset();
  practiceSessionPageControllerBrowserMocks.endPracticeSessionMock.mockReset();
  practiceSessionPageControllerBrowserMocks.setPracticeSessionQuestionMarkMock.mockReset();
}
