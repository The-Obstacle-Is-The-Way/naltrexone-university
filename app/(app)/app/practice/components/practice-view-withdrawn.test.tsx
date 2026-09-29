// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import './practice-view-test-helpers';

const { fixtureSession1Id } = vi.hoisted(() => ({
  fixtureSession1Id: crypto.randomUUID(),
}));

type PracticeViewModule = typeof import('./practice-view');
type PracticeViewProps = Parameters<PracticeViewModule['PracticeView']>[0];

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

const noop = () => undefined;

// ADR-021 §3, Pattern Registry F-11: an item whose question was withdrawn
// after the session began shows the active-session notice and offers
// navigation only.
function renderWithdrawn(input: {
  mode: 'tutor' | 'exam';
  hasNextQuestion: boolean;
}): Document {
  const props: PracticeViewProps = {
    sessionInfo: {
      sessionId: fixtureSession1Id,
      mode: input.mode,
      deadlineAt: null,
      index: 1,
      total: 3,
      isMarkedForReview: false,
    },
    loadState: { status: 'ready' },
    question: null,
    isQuestionWithdrawn: true,
    selectedChoiceId: null,
    isAnswered: false,
    submitResult: null,
    isPending: false,
    bookmarkStatus: 'idle',
    isBookmarked: false,
    isMarkingForReview: false,
    endSessionLabel: input.mode === 'exam' ? 'Review & Submit' : 'End session',
    onEndSession: noop,
    onTryAgain: noop,
    onToggleBookmark: noop,
    onToggleMarkForReview: noop,
    onSelectChoice: noop,
    onNextQuestion: noop,
    onPreviousQuestion: noop,
    hasPreviousQuestion: true,
    canNavigatePrevious: true,
    hasNextQuestion: input.hasNextQuestion,
  };
  return new DOMParser().parseFromString(
    renderToStaticMarkup(<PracticeView {...props} />),
    'text/html',
  );
}

function buttonLabels(root: Element | null): string[] {
  return Array.from(root?.querySelectorAll('button') ?? []).map((button) =>
    (button.textContent ?? '').trim(),
  );
}

describe('PracticeView for a question withdrawn during the session', () => {
  it('shows the active-session withdrawal notice instead of an error or an empty state', () => {
    const doc = renderWithdrawn({ mode: 'exam', hasNextQuestion: true });
    const notice = doc.querySelector('[role="status"]');

    expect(notice?.textContent).toContain(
      'This question was withdrawn after your session began.',
    );
    expect(notice?.textContent).toContain(
      "It can't be answered here. Continue to the next question.",
    );
    expect(doc.querySelector('[role="alert"]')).toBeNull();
    expect(doc.body.textContent).not.toContain('No more questions found.');
    expect(doc.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it.each([
    ['exam', true, ['Previous', 'Next']],
    ['exam', false, ['Previous', 'Review & Submit']],
    ['tutor', true, ['Previous', 'Next']],
    ['tutor', false, ['Previous', 'End session']],
  ] as const)(
    'in %s mode with a later question available: %s, offers %j',
    (mode, hasNextQuestion, labels) => {
      const doc = renderWithdrawn({ mode, hasNextQuestion });

      expect(
        buttonLabels(doc.querySelector('[data-testid="bottom-action-bar"]')),
      ).toEqual(labels);
    },
  );

  it('offers no mark for review, since the item cannot be answered', () => {
    const doc = renderWithdrawn({ mode: 'exam', hasNextQuestion: true });

    expect(
      buttonLabels(
        doc.querySelector('[data-testid="question-header-actions"]'),
      ),
    ).not.toContain('Mark for review');
  });
});
