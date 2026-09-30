// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { isNodeBefore, parseHtml } from '@/tests/shared/dom-helpers';
import { createQuestionProps } from './practice-view-test-helpers';

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
const SESSION_NOTICE =
  'This question has been updated since your session began.';

// ADR-021 phase 2b, Pattern Registry F-12: a session keeps the revision its
// item was bound to, and says so when a newer one became current.
function renderItem(input: {
  mode: 'tutor' | 'exam';
  superseded: boolean;
}): Document {
  const props: PracticeViewProps = {
    sessionInfo: {
      sessionId: fixtureSession1Id,
      mode: input.mode,
      deadlineAt: null,
      index: 0,
      total: 2,
      isMarkedForReview: false,
    },
    loadState: { status: 'ready' },
    question: { ...createQuestionProps(), superseded: input.superseded },
    selectedChoiceId: null,
    isAnswered: false,
    submitResult: null,
    isPending: false,
    bookmarkStatus: 'idle',
    isBookmarked: false,
    isMarkingForReview: false,
    onEndSession: noop,
    onTryAgain: noop,
    onToggleBookmark: noop,
    onToggleMarkForReview: noop,
    onSelectChoice: noop,
    onNextQuestion: noop,
    hasNextQuestion: true,
  };
  return parseHtml(renderToStaticMarkup(<PracticeView {...props} />));
}

function sessionNotice(doc: Document) {
  return (
    Array.from(doc.querySelectorAll('[role="status"]')).find((element) =>
      element.textContent?.includes(SESSION_NOTICE),
    ) ?? null
  );
}

describe('PracticeView: a session item updated since the session began', () => {
  it.each(['tutor', 'exam'] as const)(
    'shows the F-12 session notice above the stem in %s mode',
    (mode) => {
      const doc = renderItem({ mode, superseded: true });

      const notice = sessionNotice(doc);
      const stem = Array.from(doc.querySelectorAll('p')).find(
        (element) => element.textContent === 'Stem',
      );
      expect(notice).not.toBeNull();
      expect(stem).toBeDefined();
      expect(notice && stem ? isNodeBefore(notice, stem) : false).toBe(true);
      // The learner stays in the session: the notice links nowhere.
      expect(notice?.querySelector('a')).toBeNull();
    },
  );

  it('shows no notice for an item on the current revision', () => {
    expect(
      sessionNotice(renderItem({ mode: 'tutor', superseded: false })),
    ).toBe(null);
  });
});
