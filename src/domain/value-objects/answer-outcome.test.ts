import { describe, expect, it } from 'vitest';
import {
  answeredOutcome,
  isOmittedOutcome,
  omittedOutcome,
  selectedChoiceIdOrNull,
} from './answer-outcome';
import * as valueObjects from './index';

describe('AnswerOutcome', () => {
  it('creates an answered outcome with the selected choice id', () => {
    expect(answeredOutcome('choice-1')).toEqual({
      kind: 'answered',
      selectedChoiceId: 'choice-1',
    });
  });

  it('creates an omitted outcome', () => {
    expect(omittedOutcome()).toEqual({ kind: 'omitted' });
  });

  it('returns whether an outcome is omitted', () => {
    expect(isOmittedOutcome(omittedOutcome())).toBe(true);
    expect(isOmittedOutcome(answeredOutcome('choice-1'))).toBe(false);
  });

  it('returns the selected choice id or null', () => {
    expect(selectedChoiceIdOrNull(answeredOutcome('choice-1'))).toBe(
      'choice-1',
    );
    expect(selectedChoiceIdOrNull(omittedOutcome())).toBeNull();
  });

  it('is exported from the value-objects barrel', () => {
    expect(valueObjects.answeredOutcome('choice-1')).toEqual(
      answeredOutcome('choice-1'),
    );
    expect(valueObjects.omittedOutcome()).toEqual(omittedOutcome());
  });
});
