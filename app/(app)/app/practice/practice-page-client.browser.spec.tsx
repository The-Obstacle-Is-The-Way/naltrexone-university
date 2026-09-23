import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import PracticePageClient from './practice-page-client';

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/src/adapters/controllers/tag-controller', { spy: true });

const startPracticeSession = vi.mocked(practiceController.startPracticeSession);

beforeEach(() => {
  vi.mocked(practiceController.getIncompletePracticeSession).mockResolvedValue(
    ok(null),
  );
  vi.mocked(practiceController.countAvailableQuestions).mockResolvedValue(
    ok({ count: 50 }),
  );
  vi.mocked(tagController.getTags).mockResolvedValue(ok({ rows: [] }));
});

afterEach(async () => {
  await cleanup();
  vi.resetAllMocks();
});

test('enables the real session starter while session start is idle', async () => {
  const screen = await render(<PracticePageClient />);

  await expect
    .element(screen.getByText('50 questions available.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Start session', exact: true }))
    .toBeEnabled();
});

test('disables the real session starter while session start is loading', async () => {
  const result =
    createDeferred<
      Awaited<ReturnType<typeof practiceController.startPracticeSession>>
    >();
  startPracticeSession.mockReturnValue(result.promise);
  const screen = await render(<PracticePageClient />);

  try {
    await expect
      .element(screen.getByText('50 questions available.'))
      .toBeVisible();
    await screen
      .getByRole('button', { name: 'Start session', exact: true })
      .click();

    await expect
      .element(screen.getByRole('button', { name: 'Starting…', exact: true }))
      .toBeDisabled();
    expect(startPracticeSession).toHaveBeenCalledTimes(1);
  } finally {
    // Settle the real mutation timeout even when a loading assertion fails.
    // A deliberate controller rejection avoids navigating the test frame.
    result.resolve({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Fixture rejected the start.',
      },
    });
    await result.promise;
  }

  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('Fixture rejected the start.');
  await expect
    .element(screen.getByRole('button', { name: 'Start session', exact: true }))
    .toBeEnabled();
});
