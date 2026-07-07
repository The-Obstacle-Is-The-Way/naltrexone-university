import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ChoiceButton } from './choice-button';

test('reports pointer origin for a real pointer click', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected={false}
      onClick={onClick}
    />,
  );

  await screen.getByRole('radio').click();

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledWith('pointer');
});

test('reports non-pointer origin for keyboard Space selection', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected={false}
      onClick={onClick}
    />,
  );

  (screen.getByRole('radio').element() as HTMLInputElement).focus();
  await userEvent.keyboard(' ');

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledWith('non-pointer');
});

test('reports non-pointer origin for a programmatic click without pointer events', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected={false}
      onClick={onClick}
    />,
  );

  // Assistive-tech activation simulation: dispatches click/change with no
  // preceding pointerdown, so the arm must stay unset.
  (screen.getByRole('radio').element() as HTMLInputElement).click();

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledWith('non-pointer');
});

test('keyboard keydown clears a held pointer arm before the selection lands', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected={false}
      onClick={onClick}
    />,
  );

  const radio = screen.getByRole('radio').element() as HTMLInputElement;
  radio.focus();
  // Arm the flag with a pointerdown that never completes into a click (a
  // press-and-hold), then select via Space. The Space keydown must clear the
  // arm so the resulting change reports non-pointer.
  const label = radio.closest('label');
  if (!label) throw new Error('Expected choice label wrapper');
  label.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await userEvent.keyboard(' ');

  expect(onClick).toHaveBeenCalledWith('non-pointer');
  expect(onClick).not.toHaveBeenCalledWith('pointer');
});

test('renders a disabled radio input when disabled', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected={false}
      disabled
      onClick={onClick}
    />,
  );

  await expect.element(screen.getByRole('radio')).toBeDisabled();
});

test('retains selected treatment while hovered', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <ChoiceButton
      name="q1"
      label="A"
      textMd="Choice A"
      selected
      onClick={onClick}
    />,
  );

  const wrapperLabel = document.querySelector('label');
  expect(wrapperLabel).not.toBeNull();
  if (!wrapperLabel) return;

  await screen.getByText('Choice A').hover();

  const className = wrapperLabel.getAttribute('class') ?? '';
  expect(className).toContain('border-ring');
  expect(className).toContain('bg-foreground/[0.08]');
  expect(className).not.toContain('hover:border-foreground/55');
  expect(className).not.toContain('hover:bg-foreground/[0.06]');
});
