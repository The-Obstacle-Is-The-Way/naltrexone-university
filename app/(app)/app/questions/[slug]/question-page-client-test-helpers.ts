// Scaffolding shared by the QuestionView suites in question-page-client*.test.tsx.
export const fixtureSession123Id = crypto.randomUUID();

export function createBaseProps() {
  return {
    loadState: { status: 'ready' as const },
    question: null,
    selectedChoiceId: null,
    submitResult: null,
    sessionNavigation: null,
    canSubmit: false,
    isPending: false,
    onTryAgain: () => undefined,
    onSelectChoice: () => undefined,
    onSubmit: () => undefined,
    onReattempt: () => undefined,
  };
}

export function getBottomActionBar(doc: Document): HTMLDivElement | null {
  return doc.querySelector<HTMLDivElement>('[data-testid="bottom-action-bar"]');
}

export const sharedSessionNavigation = {
  questions: [
    { slug: 'q1', order: 1, isCorrect: false },
    { slug: 'q2', order: 2, isCorrect: true },
    { slug: 'q3', order: 3, isCorrect: null },
  ],
  currentIndex: 1,
  sessionId: fixtureSession123Id,
  from: 'practice',
} as const;
