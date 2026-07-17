import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { QuestionReportDialog } from '@/components/question/question-report-dialog';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

function DialogProbe({
  submitReport = async () => true,
  onOpenChangeObserved,
}: {
  submitReport?: Parameters<typeof QuestionReportDialog>[0]['submitReport'];
  onOpenChangeObserved?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChangeObserved?.(nextOpen);
    setOpen(nextOpen);
  }

  return (
    <NotificationProvider>
      <QuestionReportDialog
        open={open}
        onOpenChange={handleOpenChange}
        submitReport={submitReport}
      />
    </NotificationProvider>
  );
}

async function waitForUiCommit(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function visibleNotificationMessages(): string[] {
  return Array.from(
    document.querySelectorAll('[data-testid="app-toast"]'),
    (toast) => toast.textContent?.trim() ?? '',
  );
}

test('validates category, submits selected feedback, closes, and returns focus', async () => {
  const submitReport = vi.fn().mockResolvedValue(true);
  const screen = await render(<DialogProbe submitReport={submitReport} />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();

  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('Choose a category to send your feedback.');
  await expect
    .poll(() => document.activeElement?.getAttribute('value'))
    .toBe('incorrect_answer');

  await screen.getByRole('radio', { name: 'Ambiguous wording' }).click();
  await screen.getByRole('textbox', { name: 'Add details (optional)' }).click();
  await userEvent.keyboard('Needs a clearer stem.');
  await screen.getByRole('button', { name: 'Submit feedback' }).click();

  await expect.poll(() => submitReport.mock.calls.length).toBe(1);
  expect(submitReport).toHaveBeenCalledWith({
    category: 'ambiguous_wording',
    comment: 'Needs a clearer stem.',
  });
  await expect
    .element(screen.getByText('Thanks — our editors will take a look.'))
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test('stale success cannot close or reset a newer report submission', async () => {
  const firstSubmission = createDeferred<boolean>();
  const secondSubmission = createDeferred<boolean>();
  const submitReport = vi
    .fn()
    .mockReturnValueOnce(firstSubmission.promise)
    .mockReturnValueOnce(secondSubmission.promise);
  const screen = await render(<DialogProbe submitReport={submitReport} />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Ambiguous wording' }).click();
  await screen
    .getByRole('textbox', { name: 'Add details (optional)' })
    .fill('Report A');
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(1);

  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();

  await trigger.click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen
    .getByRole('textbox', { name: 'Add details (optional)' })
    .fill('Report B must survive');
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(2);

  firstSubmission.resolve(true);
  await waitForUiCommit();

  await expect.element(screen.getByRole('dialog')).toBeVisible();
  await expect
    .element(screen.getByRole('radio', { name: 'Other' }))
    .toBeChecked();
  await expect
    .element(screen.getByRole('textbox', { name: 'Add details (optional)' }))
    .toHaveValue('Report B must survive');
  await expect
    .element(screen.getByRole('button', { name: 'Submit feedback' }))
    .toBeDisabled();
  expect(visibleNotificationMessages()).toEqual([]);

  secondSubmission.resolve(true);
  await expect
    .element(screen.getByText('Thanks — our editors will take a look.'))
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});

test('closing the dialog alone supersedes its in-flight submission', async () => {
  const firstSubmission = createDeferred<boolean>();
  const secondSubmission = createDeferred<boolean>();
  const submitReport = vi
    .fn()
    .mockReturnValueOnce(firstSubmission.promise)
    .mockReturnValueOnce(secondSubmission.promise);
  const onOpenChangeObserved = vi.fn();
  const screen = await render(
    <DialogProbe
      submitReport={submitReport}
      onOpenChangeObserved={onOpenChangeObserved}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Ambiguous wording' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(1);

  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  const openChangeCountAfterClose = onOpenChangeObserved.mock.calls.length;

  firstSubmission.resolve(true);
  await waitForUiCommit();

  expect(onOpenChangeObserved).toHaveBeenCalledTimes(openChangeCountAfterClose);
  expect(visibleNotificationMessages()).toEqual([]);
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();

  await trigger.click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(2);

  secondSubmission.resolve(true);
  await expect
    .element(screen.getByText('Thanks — our editors will take a look.'))
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});

test('stale failed result cannot notify or re-enable a newer report submission', async () => {
  const firstSubmission = createDeferred<boolean>();
  const secondSubmission = createDeferred<boolean>();
  const submitReport = vi
    .fn()
    .mockReturnValueOnce(firstSubmission.promise)
    .mockReturnValueOnce(secondSubmission.promise);
  const screen = await render(<DialogProbe submitReport={submitReport} />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Incorrect answer' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(1);
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();

  await trigger.click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen
    .getByRole('textbox', { name: 'Add details (optional)' })
    .fill('Current report');
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(2);

  firstSubmission.resolve(false);
  await waitForUiCommit();

  await expect.element(screen.getByRole('dialog')).toBeVisible();
  await expect
    .element(screen.getByRole('textbox', { name: 'Add details (optional)' }))
    .toHaveValue('Current report');
  await expect
    .element(screen.getByRole('button', { name: 'Submit feedback' }))
    .toBeDisabled();
  expect(visibleNotificationMessages()).toEqual([]);

  secondSubmission.resolve(false);
  await expect
    .element(
      screen.getByText("Couldn't send your feedback. Check your connection."),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Submit feedback' }))
    .toBeEnabled();
});

test('stale thrown failure cannot notify or re-enable a newer report submission', async () => {
  const firstSubmission = createDeferred<boolean>();
  const secondSubmission = createDeferred<boolean>();
  const submitReport = vi
    .fn()
    .mockReturnValueOnce(firstSubmission.promise)
    .mockReturnValueOnce(secondSubmission.promise);
  const screen = await render(<DialogProbe submitReport={submitReport} />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Outdated reference' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(1);
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();

  await trigger.click();
  await screen.getByRole('radio', { name: 'Typo or formatting' }).click();
  await screen
    .getByRole('textbox', { name: 'Add details (optional)' })
    .fill('Newer typo report');
  await screen.getByRole('button', { name: 'Submit feedback' }).click();
  await expect.poll(() => submitReport.mock.calls.length).toBe(2);

  firstSubmission.reject(new Error('Obsolete network failure'));
  await waitForUiCommit();

  await expect.element(screen.getByRole('dialog')).toBeVisible();
  await expect
    .element(screen.getByRole('textbox', { name: 'Add details (optional)' }))
    .toHaveValue('Newer typo report');
  await expect
    .element(screen.getByRole('button', { name: 'Submit feedback' }))
    .toBeDisabled();
  expect(visibleNotificationMessages()).toEqual([]);

  secondSubmission.resolve(true);
  await expect
    .element(screen.getByText('Thanks — our editors will take a look.'))
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});

test('keeps the dialog open on submit failure and closes on Escape with focus return', async () => {
  const submitReport = vi.fn().mockResolvedValue(false);
  const screen = await render(<DialogProbe submitReport={submitReport} />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();

  await expect.poll(() => submitReport.mock.calls.length).toBe(1);
  await expect
    .element(
      screen.getByText("Couldn't send your feedback. Check your connection."),
    )
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).toBeVisible();
  await expect
    .element(screen.getByRole('heading', { name: 'Give feedback' }))
    .toBeVisible();

  await userEvent.keyboard('{Escape}');

  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test('cancels, resets the form, and returns focus to the trigger', async () => {
  const screen = await render(<DialogProbe />);
  const trigger = screen.getByRole('button', { name: 'Give feedback' });

  await trigger.click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen.getByRole('textbox', { name: 'Add details (optional)' }).click();
  await userEvent.keyboard('Temporary note');
  await screen.getByRole('button', { name: 'Cancel' }).click();

  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();

  await trigger.click();

  await expect
    .element(screen.getByRole('textbox', { name: 'Add details (optional)' }))
    .toHaveValue('');
  await expect
    .element(screen.getByRole('radio', { name: 'Other' }))
    .not.toBeChecked();
});

test('keeps the dialog open when submit throws', async () => {
  const submitReport = vi.fn().mockRejectedValue(new Error('Network down'));
  const screen = await render(<DialogProbe submitReport={submitReport} />);

  await screen.getByRole('button', { name: 'Give feedback' }).click();
  await screen.getByRole('radio', { name: 'Other' }).click();
  await screen.getByRole('button', { name: 'Submit feedback' }).click();

  await expect.poll(() => submitReport.mock.calls.length).toBe(1);
  await expect
    .element(
      screen.getByText("Couldn't send your feedback. Check your connection."),
    )
    .toBeVisible();
  await expect.element(screen.getByRole('dialog')).toBeVisible();
});
