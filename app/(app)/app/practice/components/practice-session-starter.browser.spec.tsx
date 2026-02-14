import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionStarter } from './practice-session-starter';

async function renderStarter() {
  const props = {
    sessionMode: 'tutor' as const,
    sessionCount: 20,
    filters: { tagSlugs: [], difficulty: null, status: 'unanswered' as const },
    availableCountStatus: 'idle' as const,
    availableCount: null,
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
    onDifficultyChange: vi.fn(),
    onStatusChange: vi.fn(),
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

test('invokes onDifficultyChange when selecting a difficulty', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Easy' }).click();
  expect(props.onDifficultyChange).toHaveBeenCalledWith('easy');
});

test('invokes onStatusChange when selecting a status', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByRole('button', { name: 'Incorrect' }).click();
  expect(props.onStatusChange).toHaveBeenCalledWith('incorrect');
});

test('invokes onToggleTag when selecting a tag', async () => {
  const { props, screen } = await renderStarter();
  await screen.getByText('Substance', { exact: true }).click();
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

test('shows error states for tags and session start', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="idle"
      availableCount={null}
      tagLoadStatus="error"
      availableTags={[]}
      sessionStartStatus="error"
      sessionStartError="Could not start session."
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
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
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeEnabled();
});

test('shows loading state for session start', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="idle"
      availableCount={null}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="loading"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Starting…' }))
    .toBeDisabled();
});

test('disables start when no questions match the selected filters', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="idle"
      availableCount={0}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="idle"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('No questions match your filters.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeDisabled();
});

test('shows available count loading state when counting questions', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="loading"
      availableCount={null}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="idle"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Counting questions…')).toBeVisible();
});

test('shows available count error state when count is unavailable', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="error"
      availableCount={null}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="idle"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('Question count unavailable.'))
    .toBeVisible();
});

test('warns when session count exceeds available question count', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="idle"
      availableCount={10}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="idle"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect
    .element(
      screen.getByText(
        'Only 10 questions available. Starting session with 10.',
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeEnabled();
});

test('shows available question count when count is ready', async () => {
  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
      availableCountStatus="idle"
      availableCount={50}
      tagLoadStatus="idle"
      availableTags={[]}
      sessionStartStatus="idle"
      sessionStartError={null}
      onDifficultyChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleTag={() => undefined}
      onSessionModeChange={() => undefined}
      onSessionCountChange={() => undefined}
      onStartSession={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('50 questions available.'))
    .toBeVisible();
});
