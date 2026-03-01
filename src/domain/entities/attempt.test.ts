import { describe, expect, it } from 'vitest';
import {
  AllAttemptRetryOrigins,
  isValidAttemptProvenance,
  isValidAttemptRetryOrigin,
} from './attempt';

describe('Attempt entity provenance', () => {
  it('defines the supported retry origins', () => {
    expect(AllAttemptRetryOrigins).toEqual([
      'history',
      'dashboard',
      'bookmarks',
      'session_review',
      'other',
    ]);
  });

  it('validates known retry origins', () => {
    expect(isValidAttemptRetryOrigin('history')).toBe(true);
    expect(isValidAttemptRetryOrigin('dashboard')).toBe(true);
    expect(isValidAttemptRetryOrigin('bookmarks')).toBe(true);
    expect(isValidAttemptRetryOrigin('session_review')).toBe(true);
    expect(isValidAttemptRetryOrigin('other')).toBe(true);
  });

  it('rejects unknown retry origins', () => {
    expect(isValidAttemptRetryOrigin('practice')).toBe(false);
  });

  it('accepts first attempts with null provenance', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
      }),
    ).toBe(true);
  });

  it('accepts session review retries with parent attempt', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: 'attempt-1',
        retryOrigin: 'session_review',
        retrySessionId: 'session-1',
      }),
    ).toBe(true);
  });

  it('accepts session review retries without parent attempt for unanswered reveals', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: null,
        retryOrigin: 'session_review',
        retrySessionId: 'session-1',
      }),
    ).toBe(true);
  });

  it('accepts standalone retries when retry origin and parent are set', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: 'attempt-1',
        retryOrigin: 'history',
        retrySessionId: null,
      }),
    ).toBe(true);
  });

  it('rejects orphaned retry parent ids without retry origin', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: 'attempt-1',
        retryOrigin: null,
        retrySessionId: null,
      }),
    ).toBe(false);
  });

  it('rejects retry session ids without session_review origin', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: 'attempt-1',
        retryOrigin: 'history',
        retrySessionId: 'session-1',
      }),
    ).toBe(false);
  });

  it('rejects session_review retries without retrySessionId', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: 'attempt-1',
        retryOrigin: 'session_review',
        retrySessionId: null,
      }),
    ).toBe(false);
  });

  it('rejects non-session origins with null retryOfAttemptId', () => {
    expect(
      isValidAttemptProvenance({
        retryOfAttemptId: null,
        retryOrigin: 'bookmarks',
        retrySessionId: null,
      }),
    ).toBe(false);
  });
});
