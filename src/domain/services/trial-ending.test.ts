import { describe, expect, it } from 'vitest';
import { classifyTrialEnding } from './trial-ending';

describe('classifyTrialEnding', () => {
  it('ends a trial whose cancellation is scheduled, whether or not a card is saved', () => {
    expect(
      classifyTrialEnding({ cancelAtPeriodEnd: true, cardSaved: true }),
    ).toBe('cancellationScheduled');
    expect(
      classifyTrialEnding({ cancelAtPeriodEnd: true, cardSaved: false }),
    ).toBe('cancellationScheduled');
  });

  it('renews a trial on its saved card when no cancellation is scheduled', () => {
    expect(
      classifyTrialEnding({ cancelAtPeriodEnd: false, cardSaved: true }),
    ).toBe('renewsOnSavedCard');
  });

  it('needs a card for a trial without one and without a scheduled cancellation', () => {
    expect(
      classifyTrialEnding({ cancelAtPeriodEnd: false, cardSaved: false }),
    ).toBe('needsCard');
  });
});
