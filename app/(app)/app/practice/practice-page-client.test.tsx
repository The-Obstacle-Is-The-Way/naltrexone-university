// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('./components', () => ({
  IncompleteSessionCard: () => null,
  PracticeSessionStarter: (props: {
    isPending: boolean;
    sessionStartStatus: string;
  }) => (
    <div data-testid="starter-props">
      {props.sessionStartStatus}:{String(props.isPending)}
    </div>
  ),
}));

let sessionStartStatus: 'idle' | 'loading' | 'error' = 'loading';

vi.mock('./hooks/use-practice-session-controls', () => ({
  usePracticeSessionControls: () => ({
    filters: { tagSlugs: [], difficulties: [] },
    sessionMode: 'tutor',
    sessionCount: 20,
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
    onToggleDifficulty: () => undefined,
    onStartSession: async () => undefined,
    onAbandonIncompleteSession: async () => undefined,
  }),
}));

describe('PracticePageClient', () => {
  it('passes isPending=false to PracticeSessionStarter while sessionStartStatus is loading', async () => {
    sessionStartStatus = 'loading';
    const PracticePageClient = (await import('./practice-page-client')).default;

    const html = renderToStaticMarkup(<PracticePageClient />);
    expect(html).toContain('data-testid="starter-props">loading:false<');
  });

  it('passes isPending=false to PracticeSessionStarter while sessionStartStatus is idle', async () => {
    sessionStartStatus = 'idle';
    const PracticePageClient = (await import('./practice-page-client')).default;

    const html = renderToStaticMarkup(<PracticePageClient />);
    expect(html).toContain('data-testid="starter-props">idle:false<');
  });
});
