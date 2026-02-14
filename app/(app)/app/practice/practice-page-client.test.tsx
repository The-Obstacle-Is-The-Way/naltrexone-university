// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('./components', () => ({
  IncompleteSessionCard: () => null,
  PracticeSessionStarter: (props: { sessionStartStatus: string }) => (
    <div data-testid="starter-props">{props.sessionStartStatus}</div>
  ),
}));

let sessionStartStatus: 'idle' | 'loading' | 'error' = 'loading';

vi.mock('./hooks/use-practice-session-controls', () => ({
  usePracticeSessionControls: () => ({
    filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
    sessionMode: 'tutor',
    sessionCount: 20,
    availableCountStatus: 'idle',
    availableCount: null,
    tagLoadStatus: 'idle',
    availableTags: [],
    sessionStartStatus,
    sessionStartError: null,
    incompleteSessionStatus: 'idle',
    incompleteSessionError: null,
    incompleteSession: null,
    onSessionModeChange: () => undefined,
    onSessionCountChange: () => undefined,
    onToggleTag: () => undefined,
    onDifficultyChange: () => undefined,
    onStatusChange: () => undefined,
    onStartSession: async () => undefined,
    onAbandonIncompleteSession: async () => undefined,
  }),
}));

describe('PracticePageClient', () => {
  it('passes sessionStartStatus to PracticeSessionStarter while sessionStartStatus is loading', async () => {
    sessionStartStatus = 'loading';
    const PracticePageClient = (await import('./practice-page-client')).default;

    const html = renderToStaticMarkup(<PracticePageClient />);
    expect(html).toContain('data-testid="starter-props">loading<');
  });

  it('passes sessionStartStatus to PracticeSessionStarter while sessionStartStatus is idle', async () => {
    sessionStartStatus = 'idle';
    const PracticePageClient = (await import('./practice-page-client')).default;

    const html = renderToStaticMarkup(<PracticePageClient />);
    expect(html).toContain('data-testid="starter-props">idle<');
  });
});
