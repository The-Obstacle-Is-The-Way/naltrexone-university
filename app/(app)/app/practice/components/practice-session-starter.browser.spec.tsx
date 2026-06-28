import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import {
  PracticeSessionStarter,
  type PracticeSessionStarterProps,
} from '@/app/(app)/app/practice/components/practice-session-starter';

const fixtureTag1Id = crypto.randomUUID();

function starterProps(
  overrides: Partial<PracticeSessionStarterProps> = {},
): PracticeSessionStarterProps {
  const props: PracticeSessionStarterProps = {
    sessionMode: 'tutor',
    sessionCount: 20,
    filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
    availableCountStatus: 'idle',
    availableCount: null,
    tagLoadStatus: 'idle',
    availableTags: [
      {
        id: fixtureTag1Id,
        slug: 'opioids',
        name: 'Opioids',
        kind: 'substance',
      },
    ],
    sessionStartStatus: 'idle',
    sessionStartError: null,
    onDifficultyChange: vi.fn(),
    onStatusChange: vi.fn(),
    onToggleTag: vi.fn(),
    onSessionModeChange: vi.fn(),
    onSessionCountChange: vi.fn(),
    onStartSession: vi.fn(),
  };

  return {
    ...props,
    ...overrides,
    filters: { ...props.filters, ...(overrides.filters ?? {}) },
  };
}

async function renderStarter(
  overrides: Partial<PracticeSessionStarterProps> = {},
) {
  const props = starterProps(overrides);
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

test('invokes onDifficultyChange with null when selecting all difficulties', async () => {
  const { props, screen } = await renderStarter({
    filters: {
      tagSlugs: [],
      difficulty: 'easy',
      status: 'unanswered',
    },
  });

  await screen.getByRole('button', { name: 'All' }).click();
  expect(props.onDifficultyChange).toHaveBeenCalledWith(null);
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
  const { screen } = await renderStarter({
    tagLoadStatus: 'error',
    availableTags: [],
    sessionStartStatus: 'error',
    sessionStartError: 'Could not start session.',
  });

  await expect.element(screen.getByText('Tags unavailable.')).toBeVisible();
  await expect
    .element(screen.getByText('Could not start session.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeEnabled();
});

test('shows loading state for session start', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    sessionStartStatus: 'loading',
  });

  await expect
    .element(screen.getByRole('button', { name: 'Starting…' }))
    .toBeDisabled();
});

test('disables session configuration controls while session start is loading', async () => {
  const { screen } = await renderStarter({
    sessionStartStatus: 'loading',
  });

  await screen.getByText('Substance', { exact: true }).click();

  await expect
    .element(screen.getByRole('button', { name: 'Tutor' }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: 'Exam' }))
    .toBeDisabled();
  await expect.element(screen.getByRole('spinbutton')).toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: 'Unanswered' }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: 'Easy' }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: 'Opioids' }))
    .toBeDisabled();
});

test('disables start when no questions match the selected filters', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    availableCount: 0,
  });

  await expect
    .element(screen.getByText('No questions match your filters.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeDisabled();
});

test('shows available count loading state when counting questions', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    availableCountStatus: 'loading',
  });

  await expect.element(screen.getByText('Counting questions…')).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeEnabled();
});

test('shows available count error state when count is unavailable', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    availableCountStatus: 'error',
  });

  await expect
    .element(screen.getByText('Question count unavailable.'))
    .toBeVisible();
});

test('warns when session count exceeds available question count', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    availableCount: 10,
  });

  await expect
    .element(
      screen.getByText(
        'Only 10 questions available. Starting session with 10 questions.',
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session' }))
    .toBeEnabled();
});

test('shows available question count when count is ready', async () => {
  const { screen } = await renderStarter({
    availableTags: [],
    availableCount: 50,
  });

  await expect
    .element(screen.getByText('50 questions available.'))
    .toBeVisible();
});
