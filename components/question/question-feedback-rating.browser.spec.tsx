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
  const helpfulButton = screen.getByRole('button', {
    name: /^Mark as helpful$/,
  });

  await helpfulButton.click();

  expect(onRate).toHaveBeenCalledWith('helpful');
  await expect.element(helpfulButton).toHaveAttribute('aria-pressed', 'true');

  await helpfulButton.click();

  expect(onRate).toHaveBeenLastCalledWith(null);
  await expect.element(helpfulButton).toHaveAttribute('aria-pressed', 'false');
});

test('selects and retracts the not-helpful rating', async () => {
  const onRate = vi.fn();
  const screen = await render(
    <RatingProbe initialRating="not_helpful" onRate={onRate} />,
  );
  const notHelpfulButton = screen.getByRole('button', {
    name: /^Mark as not helpful$/,
  });

  await expect
    .element(notHelpfulButton)
    .toHaveAttribute('aria-pressed', 'true');

  await notHelpfulButton.click();

  expect(onRate).toHaveBeenCalledWith(null);
  await expect
    .element(notHelpfulButton)
    .toHaveAttribute('aria-pressed', 'false');
});
