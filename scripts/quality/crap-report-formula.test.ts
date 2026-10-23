import { describe, expect, it } from 'vitest';
import { calculateCrapScore } from './crap-report';

describe('calculateCrapScore', () => {
  it('uses complexity as the floor when coverage is complete', () => {
    expect(calculateCrapScore(5, 1)).toBe(5);
  });

  it('squares uncovered complexity', () => {
    expect(calculateCrapScore(30, 0)).toBe(930);
  });

  it('applies the cubic coverage term for partial coverage', () => {
    expect(calculateCrapScore(2, 0.5)).toBe(2.5);
  });

  it('rejects values outside the CRAP formula domain', () => {
    expect(() => calculateCrapScore(0, 1)).toThrow(
      'Complexity must be a positive integer',
    );
    expect(() => calculateCrapScore(1, Number.NaN)).toThrow(
      'Coverage must be a finite fraction',
    );
  });
});
