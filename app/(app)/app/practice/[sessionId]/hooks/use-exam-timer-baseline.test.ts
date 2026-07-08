import { describe, expect, it } from 'vitest';
import {
  deriveMilestoneBaseline,
  deriveNextMilestoneBaseline,
  mergeMilestoneAnnouncement,
} from './use-exam-timer';

describe('deriveMilestoneBaseline', () => {
  it('uses the previous baseline only when visible on the same deadline', () => {
    expect(
      deriveMilestoneBaseline({
        isDocumentHidden: false,
        isSameDeadline: true,
        previousBaseline: 310,
      }),
    ).toBe(310);
  });

  it('returns null on a deadline change even while visible', () => {
    expect(
      deriveMilestoneBaseline({
        isDocumentHidden: false,
        isSameDeadline: false,
        previousBaseline: 310,
      }),
    ).toBeNull();
  });

  it('returns null while hidden regardless of deadline', () => {
    expect(
      deriveMilestoneBaseline({
        isDocumentHidden: true,
        isSameDeadline: true,
        previousBaseline: 310,
      }),
    ).toBeNull();
    expect(
      deriveMilestoneBaseline({
        isDocumentHidden: true,
        isSameDeadline: false,
        previousBaseline: 310,
      }),
    ).toBeNull();
  });
});

describe('deriveNextMilestoneBaseline', () => {
  it('advances to the next remaining seconds while visible', () => {
    expect(
      deriveNextMilestoneBaseline({
        isDocumentHidden: false,
        isSameDeadline: true,
        previousBaseline: 310,
        nextRemainingSeconds: 290,
      }),
    ).toBe(290);
    expect(
      deriveNextMilestoneBaseline({
        isDocumentHidden: false,
        isSameDeadline: false,
        previousBaseline: 310,
        nextRemainingSeconds: 290,
      }),
    ).toBe(290);
  });

  it('freezes the baseline while hidden on the same deadline', () => {
    expect(
      deriveNextMilestoneBaseline({
        isDocumentHidden: true,
        isSameDeadline: true,
        previousBaseline: 310,
        nextRemainingSeconds: 278,
      }),
    ).toBe(310);
  });

  it('discards the baseline when the deadline changes while hidden', () => {
    expect(
      deriveNextMilestoneBaseline({
        isDocumentHidden: true,
        isSameDeadline: false,
        previousBaseline: 310,
        nextRemainingSeconds: 278,
      }),
    ).toBeNull();
  });
});

describe('mergeMilestoneAnnouncement', () => {
  const announced = {
    remainingSeconds: 289,
    isExpired: false,
    milestoneAnnouncement: '5 minutes remaining',
  };
  const silentSameRemaining = {
    remainingSeconds: 289,
    isExpired: false,
    milestoneAnnouncement: null,
  };

  it('preserves the announcement while the countdown has not advanced', () => {
    expect(
      mergeMilestoneAnnouncement({
        previous: announced,
        next: silentSameRemaining,
        isSameDeadline: true,
      }),
    ).toMatchObject({ milestoneAnnouncement: '5 minutes remaining' });
  });

  it('never carries an announcement across a deadline change', () => {
    expect(
      mergeMilestoneAnnouncement({
        previous: announced,
        next: silentSameRemaining,
        isSameDeadline: false,
      }),
    ).toMatchObject({ milestoneAnnouncement: null });
  });

  it('clears once the countdown advances', () => {
    expect(
      mergeMilestoneAnnouncement({
        previous: announced,
        next: {
          remainingSeconds: 288,
          isExpired: false,
          milestoneAnnouncement: null,
        },
        isSameDeadline: true,
      }),
    ).toMatchObject({ milestoneAnnouncement: null });
  });

  it('never overwrites a fresh crossing', () => {
    expect(
      mergeMilestoneAnnouncement({
        previous: silentSameRemaining,
        next: announced,
        isSameDeadline: true,
      }),
    ).toMatchObject({ milestoneAnnouncement: '5 minutes remaining' });
  });

  it('passes null states through unchanged', () => {
    expect(
      mergeMilestoneAnnouncement({
        previous: null,
        next: silentSameRemaining,
        isSameDeadline: true,
      }),
    ).toBe(silentSameRemaining);
    expect(
      mergeMilestoneAnnouncement({
        previous: announced,
        next: null,
        isSameDeadline: true,
      }),
    ).toBeNull();
  });
});
