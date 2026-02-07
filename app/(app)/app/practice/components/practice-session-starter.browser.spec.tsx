import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionStarter } from './practice-session-starter';

async function renderStarter() {
  const props = {
    sessionMode: 'tutor' as const,
    sessionCount: 20,
    filters: { tagSlugs: [], difficulties: [] },
    tagLoadStatus: 'idle' as const,
    availableTags: [
      {
        id: 'tag_1',
        slug: 'opioids',
        name: 'Opioids',
        kind: 'substance' as const,
      },
    ],
    sessionStartStatus: 'idle' as const,
    sessionStartError: null,
    isPending: false,
    onToggleDifficulty: vi.fn(),
    onToggleTag: vi.fn(),
    onSessionModeChange: vi.fn(),
    onSessionCountChange: vi.fn(),
    onStartSession: vi.fn(),
  };
  const screen = await render(<PracticeSessionStarter {...props} />);
  return { props, screen };
}

test('invokes onSessionModeChange when selecting exam mode', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Exam' }).click();
  expect(props.onSessionModeChange).toHaveBeenCalledWith('exam');
});

test('invokes onToggleDifficulty when selecting a difficulty', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Easy' }).click();
  expect(props.onToggleDifficulty).toHaveBeenCalledWith('easy');
});

test('invokes onToggleTag when selecting a tag', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Opioids' }).click();
  expect(props.onToggleTag).toHaveBeenCalledWith('opioids');
});

test('invokes onSessionCountChange when count input changes', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('spinbutton').fill('35');
  expect(props.onSessionCountChange).toHaveBeenCalled();
});

test('invokes onStartSession when start button is clicked', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Start session' }).click();
  expect(props.onStartSession).toHaveBeenCalledTimes(1);
});

test('shows loading and error states for tags and session start', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulties: [] }}
      tagLoadStatus="error"
      availableTags={[]}
      sessionStartStatus="error"
      sessionStartError="Could not start session."
      isPending
      onToggleDifficulty={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Tags unavailable.')).toBeVisible();
  await expect
    .element(screen.getByText('Could not start session.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Starting…' }))
    .toBeDisabled();
});
