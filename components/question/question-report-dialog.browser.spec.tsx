import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { QuestionReportDialog } from '@/components/question/question-report-dialog';
import { NotificationProvider } from '@/components/ui/notification-provider';

function DialogProbe({
  submitReport = async () => true,
}: {
  submitReport?: Parameters<typeof QuestionReportDialog>[0]['submitReport'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <NotificationProvider>
      <QuestionReportDialog
        open={open}
        onOpenChange={setOpen}
        submitReport={submitReport}
      />
    </NotificationProvider>
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
  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
  await expect.element(trigger).toHaveFocus();
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

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
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

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
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
