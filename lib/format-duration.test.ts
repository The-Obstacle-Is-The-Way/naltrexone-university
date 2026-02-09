import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('returns seconds only when under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('returns minutes only when seconds is zero', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(300)).toBe('5m');
  });

  it('returns minutes and seconds when both are present', () => {
    expect(formatDuration(80)).toBe('1m 20s');
    expect(formatDuration(125)).toBe('2m 5s');
  });
});
