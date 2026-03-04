import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ChoiceButton } from './choice-button';

test('calls onClick when selected', async () => {
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
  expect(className).toContain('bg-muted/40');
  expect(className).not.toContain('hover:border-muted-foreground/30');
});
