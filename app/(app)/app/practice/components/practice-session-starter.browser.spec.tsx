import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionStarter } from './practice-session-starter';

test('invokes callbacks for session setup interactions', async () => {
  const onSessionModeChange = vi.fn();
  const onSessionCountChange = vi.fn();
  const onToggleDifficulty = vi.fn();
  const onToggleTag = vi.fn();
  const onStartSession = vi.fn();

  const screen = await render(
    <PracticeSessionStarter
      sessionMode="tutor"
      sessionCount={20}
      filters={{ tagSlugs: [], difficulties: [] }}
      tagLoadStatus="idle"
      availableTags={[
        {
          id: 'tag_1',
          slug: 'opioids',
          name: 'Opioids',
          kind: 'substance',
        },
      ]}
      sessionStartStatus="idle"
      sessionStartError={null}
      isPending={false}
      onToggleDifficulty={onToggleDifficulty}
      onToggleTag={onToggleTag}
      onSessionModeChange={onSessionModeChange}
      onSessionCountChange={onSessionCountChange}
      onStartSession={onStartSession}
    />,
  );

  await screen.getByRole('button', { name: 'Exam' }).click();
  expect(onSessionModeChange).toHaveBeenCalledWith('exam');

  await screen.getByRole('button', { name: 'Easy' }).click();
  expect(onToggleDifficulty).toHaveBeenCalledWith('easy');

  await screen.getByRole('button', { name: 'Opioids' }).click();
  expect(onToggleTag).toHaveBeenCalledWith('opioids');

  await screen.getByRole('spinbutton').fill('35');
  expect(onSessionCountChange).toHaveBeenCalled();

  await screen.getByRole('button', { name: 'Start session' }).click();
  expect(onStartSession).toHaveBeenCalledTimes(1);
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
