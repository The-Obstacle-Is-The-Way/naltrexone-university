import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ChoiceButton } from './ChoiceButton';

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
