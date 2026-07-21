import { describe, expect, it } from 'vitest';
import { getEffectiveSelectedChoiceId } from './practice-session-state';

const state = {
  latestSelectedChoiceId: 'latest-choice',
  draftSelectedChoiceId: 'draft-choice',
};

describe('getEffectiveSelectedChoiceId', () => {
  it('uses the draft choice for an active exam', () => {
    expect(
      getEffectiveSelectedChoiceId({ mode: 'exam', endedAt: null }, state),
    ).toBe('draft-choice');
  });

  it('falls back to the latest choice for a legacy active exam without a draft', () => {
    expect(
      getEffectiveSelectedChoiceId(
        { mode: 'exam', endedAt: null },
        { ...state, draftSelectedChoiceId: null },
      ),
    ).toBe('latest-choice');
  });

  it('uses the latest choice for an ended exam', () => {
    expect(
      getEffectiveSelectedChoiceId(
        { mode: 'exam', endedAt: new Date('2026-07-21T00:00:00.000Z') },
        state,
      ),
    ).toBe('latest-choice');
  });

  it('uses the latest choice for a tutor session', () => {
    expect(
      getEffectiveSelectedChoiceId({ mode: 'tutor', endedAt: null }, state),
    ).toBe('latest-choice');
  });
});
