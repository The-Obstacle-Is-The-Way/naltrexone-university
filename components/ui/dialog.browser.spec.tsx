import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

function DialogProbe() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give feedback</DialogTitle>
          <DialogDescription>
            Spotted an issue or have a suggestion?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Close dialog</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

test('opens, traps focus, closes on Escape, and returns focus to the trigger', async () => {
  const screen = await render(<DialogProbe />);
  const trigger = screen.getByRole('button', { name: 'Open dialog' });

  await trigger.click();

  await expect
    .element(screen.getByRole('dialog', { name: 'Give feedback' }))
    .toBeVisible();
  await expect
    .poll(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const title = document.querySelector('[data-slot="dialog-title"]');
      const description = document.querySelector(
        '[data-slot="dialog-description"]',
      );

      return (
        dialog?.getAttribute('aria-modal') === 'true' &&
        dialog?.getAttribute('aria-labelledby') === title?.id &&
        dialog?.getAttribute('aria-describedby') === description?.id
      );
    })
    .toBe(true);
  await expect
    .poll(() => document.activeElement?.closest('[role="dialog"]') !== null)
    .toBe(true);

  await userEvent.keyboard('{Escape}');

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
  await expect.element(trigger).toHaveFocus();
});

test('closes from DialogClose and returns focus to the trigger', async () => {
  const screen = await render(<DialogProbe />);
  const trigger = screen.getByRole('button', { name: 'Open dialog' });

  await trigger.click();
  await screen.getByRole('button', { name: 'Close dialog' }).click();

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
  await expect.element(trigger).toHaveFocus();
});
