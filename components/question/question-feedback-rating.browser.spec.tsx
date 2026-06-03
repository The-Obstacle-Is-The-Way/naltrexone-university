import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  QuestionFeedbackRating,
  type QuestionFeedbackRatingProps,
} from './question-feedback-rating';

function RatingProbe({
  initialRating = null,
  onRate = () => undefined,
}: {
  initialRating?: QuestionFeedbackRatingProps['rating'];
  onRate?: QuestionFeedbackRatingProps['onRate'];
}) {
  const [rating, setRating] =
    useState<QuestionFeedbackRatingProps['rating']>(initialRating);

  return (
    <QuestionFeedbackRating
      rating={rating}
      feedbackStatus="idle"
      onRate={(nextRating) => {
        onRate(nextRating);
        setRating(nextRating);
      }}
    />
  );
}

test('selects and retracts the helpful rating', async () => {
  const onRate = vi.fn();
  const screen = await render(<RatingProbe onRate={onRate} />);
  const goodButton = screen.getByRole('button', { name: /^Good question$/ });

  await goodButton.click();

  expect(onRate).toHaveBeenCalledWith('helpful');
  await expect.element(goodButton).toHaveAttribute('aria-pressed', 'true');

  await goodButton.click();

  expect(onRate).toHaveBeenLastCalledWith(null);
  await expect.element(goodButton).toHaveAttribute('aria-pressed', 'false');
});

test('selects and retracts the not-good rating', async () => {
  const onRate = vi.fn();
  const screen = await render(
    <RatingProbe initialRating="not_helpful" onRate={onRate} />,
  );
  const notGoodButton = screen.getByRole('button', {
    name: /^Not a good question$/,
  });

  await expect.element(notGoodButton).toHaveAttribute('aria-pressed', 'true');

  await notGoodButton.click();

  expect(onRate).toHaveBeenCalledWith(null);
  await expect.element(notGoodButton).toHaveAttribute('aria-pressed', 'false');
});
