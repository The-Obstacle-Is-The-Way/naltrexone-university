import { describe, expect, it } from 'vitest';
import { ROUTES, toPracticeSessionRoute, toQuestionRoute } from './routes';

describe('lib/routes', () => {
  it('builds question routes from a slash-free base constant', () => {
    expect(ROUTES.APP_QUESTIONS).toBe('/app/questions');
    expect(toQuestionRoute('opioid-use-disorder')).toBe(
      '/app/questions/opioid-use-disorder',
    );
  });

  it("supports 'history' origin query parameter for question routes", () => {
    expect(toQuestionRoute('opioid-use-disorder', { from: 'history' })).toBe(
      '/app/questions/opioid-use-disorder?from=history',
    );
  });

  it('supports mode query parameters for question routes', () => {
    expect(toQuestionRoute('opioid-use-disorder', { mode: 'review' })).toBe(
      '/app/questions/opioid-use-disorder?mode=review',
    );
  });

  it('supports combined origin and mode query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'dashboard',
        mode: 'review',
      }),
    ).toBe('/app/questions/opioid-use-disorder?from=dashboard&mode=review');
  });

  it('supports sessionId query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
      }),
    ).toBe(
      '/app/questions/opioid-use-disorder?from=practice&mode=review&sessionId=session_123',
    );
  });

  it('supports attemptId query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'dashboard',
        mode: 'review',
        attemptId: 'attempt_123',
      }),
    ).toBe(
      '/app/questions/opioid-use-disorder?from=dashboard&mode=review&attemptId=attempt_123',
    );
  });

  it('supports combined sessionId and attemptId query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
        attemptId: 'attempt_123',
      }),
    ).toBe(
      '/app/questions/opioid-use-disorder?from=practice&mode=review&sessionId=session_123&attemptId=attempt_123',
    );
  });

  it('supports historyHref query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'history',
        mode: 'review',
        historyHref: '/app/history?tab=questions&offset=0&limit=20',
      }),
    ).toBe(
      '/app/questions/opioid-use-disorder?from=history&mode=review&historyHref=%2Fapp%2Fhistory%3Ftab%3Dquestions%26offset%3D0%26limit%3D20',
    );
  });

  it('supports history sequence query parameters for question routes', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'history',
        mode: 'review',
        historySeq: 'q-1,q-2,q-3',
        historyIndex: 1,
      }),
    ).toBe(
      '/app/questions/opioid-use-disorder?from=history&mode=review&historySeq=q-1%2Cq-2%2Cq-3&historyIndex=1',
    );
  });

  it('omits mode query parameter when mode is undefined', () => {
    expect(
      toQuestionRoute('opioid-use-disorder', {
        from: 'dashboard',
        mode: undefined,
      }),
    ).toBe('/app/questions/opioid-use-disorder?from=dashboard');
  });

  it('exports a quick practice route constant', () => {
    expect(ROUTES.APP_PRACTICE_QUICK).toBe('/app/practice/quick');
  });

  it('exports a history route constant', () => {
    expect(ROUTES.APP_HISTORY).toBe('/app/history');
  });

  it('builds practice session routes from the practice base path', () => {
    expect(toPracticeSessionRoute('session_123')).toBe(
      '/app/practice/session_123',
    );
  });
});
