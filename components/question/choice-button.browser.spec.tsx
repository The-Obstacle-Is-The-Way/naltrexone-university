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

test('a right-click press must not arm pointer activation for a later keyboard selection', async () => {
  const onClickA = vi.fn();
  const onClickB = vi.fn();
  const screen = await render(
    <>
      <ChoiceButton
        name="q1"
        label="A"
        textMd="Choice A"
        selected={false}
        onClick={onClickA}
      />
      <ChoiceButton
        name="q1"
        label="B"
        textMd="Choice B"
        selected={false}
        onClick={onClickB}
      />
    </>,
  );

  const radioA = screen
    .getByRole('radio', { name: /Choice A/ })
    .element() as HTMLInputElement;
  const labelA = radioA.closest('label');
  if (!labelA) throw new Error('Expected choice label wrapper');

  // Right-click (context menu) fires pointerdown but never a click, so
  // nothing consumes the arm. It must not arm at all.
  labelA.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 }),
  );

  const radioB = screen
    .getByRole('radio', { name: /Choice B/ })
    .element() as HTMLInputElement;
  radioB.focus();
  // Arrow-key navigation lands on A: the keydown fires on B's label, so A's
  // own keydown-clear never runs. A stale arm here would misclassify this
  // keyboard selection as a pointer commit.
  await userEvent.keyboard('{ArrowUp}');

  expect(onClickA).toHaveBeenCalledWith('non-pointer');
  expect(onClickA).not.toHaveBeenCalledWith('pointer');
});

test('window blur clears an abandoned pointer press before a later activation', async () => {
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
  const label = radio.closest('label');
  if (!label) throw new Error('Expected choice label wrapper');

  // Press is abandoned via Alt-Tab: pointerdown fires, then the window blurs
  // with no click, pointerup, or pointerleave on this element.
  label.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
  );
  window.dispatchEvent(new Event('blur'));

  // A later assistive-tech activation (click without pointer events) must not
  // inherit the stale arm.
  radio.click();

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledWith('non-pointer');
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
