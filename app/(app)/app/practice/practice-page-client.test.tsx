// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('./components', () => ({
  IncompleteSessionCard: () => null,
  PracticeSessionHistoryPanel: () => null,
  PracticeSessionStarter: (props: { isPending: boolean }) => (
    <div data-testid="starter-pending">{String(props.isPending)}</div>
  ),
}));

vi.mock('./hooks/use-practice-session-controls', () => ({
  usePracticeSessionControls: () => ({
    filters: { tagSlugs: [], difficulties: [] },
    sessionMode: 'tutor',
    sessionCount: 20,
    tagLoadStatus: 'idle',
    availableTags: [],
    sessionStartStatus: 'loading',
    sessionStartError: null,
    incompleteSessionStatus: 'idle',
    incompleteSessionError: null,
    incompleteSession: null,
    sessionHistoryStatus: 'idle',
    sessionHistoryError: null,
    sessionHistoryRows: [],
    selectedHistorySessionId: null,
    selectedHistoryReview: null,
    historyReviewLoadState: { status: 'idle' },
    onSessionModeChange: () => undefined,
    onSessionCountChange: () => undefined,
    onToggleTag: () => undefined,
    onToggleDifficulty: () => undefined,
    onStartSession: async () => undefined,
    onAbandonIncompleteSession: async () => undefined,
    onOpenSessionHistory: async () => undefined,
  }),
}));

describe('PracticePageClient', () => {
  it('passes sessionStartStatus to PracticeSessionStarter isPending prop', async () => {
    const PracticePageClient = (await import('./practice-page-client')).default;

    const html = renderToStaticMarkup(<PracticePageClient />);
    expect(html).toContain('starter-pending');
    expect(html).toContain('true');
  });
});
