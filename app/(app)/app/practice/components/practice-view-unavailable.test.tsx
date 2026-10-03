// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { UnavailableQuestionAvailability } from '@/src/domain/value-objects';
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

// ADR-021 §3, ADR-022 Decision 5, Pattern Registry F-11: an item whose
// question became unavailable after the session began shows the
// active-session notice for its state and offers navigation only.
function renderUnavailable(input: {
  mode: 'tutor' | 'exam';
  hasNextQuestion: boolean;
  hasPreviousQuestion?: boolean;
  availability?: UnavailableQuestionAvailability;
  countsIfEndedNow?: boolean;
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
    unavailable: {
      availability: input.availability ?? 'withdrawn',
      countsIfEndedNow: input.countsIfEndedNow ?? false,
    },
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
    hasPreviousQuestion: input.hasPreviousQuestion ?? true,
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

describe('PracticeView for a question that became unavailable during the session', () => {
  it.each([
    ['withdrawn', 'This question was withdrawn after your session began.'],
    [
      'under_review',
      'This question was placed under review after your session began.',
    ],
    [
      'retired',
      'This question was retired from the bank after your session began.',
    ],
  ] as const)(
    'names the state, %s, in the notice, instead of an error or an empty state',
    (availability, heading) => {
      const doc = renderUnavailable({
        mode: 'exam',
        hasNextQuestion: true,
        availability,
      });
      const notice = doc.querySelector('[role="status"]');

      expect(notice?.textContent).toContain(heading);
      // ADR-022 Decision 5.
      expect(notice?.textContent).toContain(
        "It can't be answered here. It won't count toward your score. Continue to the next question.",
      );
      expect(doc.querySelector('[role="alert"]')).toBeNull();
      expect(doc.body.textContent).not.toContain('No more questions found.');
      expect(doc.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    },
  );

  // ADR-022 Amendment: a tutor answer already given on a question retired
  // since still counts, so the notice does not say otherwise.
  it('does not say the item will not count when it still will', () => {
    const doc = renderUnavailable({
      mode: 'tutor',
      hasNextQuestion: true,
      availability: 'retired',
      countsIfEndedNow: true,
    });
    const notice = doc.querySelector('[role="status"]');

    expect(notice?.textContent).toContain(
      "It can't be answered here. Continue to the next question.",
    );
    expect(notice?.textContent).not.toContain('count toward your score');
  });

  it.each([
    ['exam', true, ['Previous', 'Next']],
    ['exam', false, ['Previous', 'Review & Submit']],
    ['tutor', true, ['Previous', 'Next']],
    ['tutor', false, ['Previous', 'End session']],
  ] as const)(
    'in %s mode with a later question available: %s, offers %j',
    (mode, hasNextQuestion, labels) => {
      const doc = renderUnavailable({ mode, hasNextQuestion });

      expect(
        buttonLabels(doc.querySelector('[data-testid="bottom-action-bar"]')),
      ).toEqual(labels);
    },
  );

  it('offers only Next on an unavailable first item', () => {
    const doc = renderUnavailable({
      mode: 'tutor',
      hasNextQuestion: true,
      hasPreviousQuestion: false,
    });

    expect(
      buttonLabels(doc.querySelector('[data-testid="bottom-action-bar"]')),
    ).toEqual(['Next']);
  });

  it('offers no mark for review, since the item cannot be answered', () => {
    const doc = renderUnavailable({ mode: 'exam', hasNextQuestion: true });

    expect(
      buttonLabels(
        doc.querySelector('[data-testid="question-header-actions"]'),
      ),
    ).not.toContain('Mark for review');
  });
});
