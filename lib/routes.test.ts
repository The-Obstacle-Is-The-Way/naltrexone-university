import { describe, expect, it } from 'vitest';
import {
  AUTH_REDIRECT_QUERY_PARAM,
  PRICING_QUERY_PARAMS,
  ROUTES,
  toPracticeSessionRoute,
  toPricingRoute,
  toQuestionRoute,
  toSignUpRedirectRoute,
} from './routes';

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

  it("supports 'summary' origin query parameter for question routes", () => {
    expect(toQuestionRoute('opioid-use-disorder', { from: 'summary' })).toBe(
      '/app/questions/opioid-use-disorder?from=summary',
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

  it('builds pricing routes with shared query parameter names', () => {
    expect(PRICING_QUERY_PARAMS.plan).toBe('plan');
    expect(PRICING_QUERY_PARAMS.reason).toBe('reason');
    expect(toPricingRoute({ plan: 'monthly' })).toBe('/pricing?plan=monthly');
    expect(toPricingRoute({ reason: 'manage_billing' })).toBe(
      '/pricing?reason=manage_billing',
    );
    expect(toPricingRoute({ reason: 'payment_processing' })).toBe(
      '/pricing?reason=payment_processing',
    );
    expect(toPricingRoute({ checkout: 'cancel' })).toBe(
      '/pricing?checkout=cancel',
    );
  });

  it('builds Clerk sign-up redirects with an explicit return destination', () => {
    const returnDestination = toPricingRoute({ plan: 'annual' });

    expect(AUTH_REDIRECT_QUERY_PARAM).toBe('redirect_url');
    expect(toSignUpRedirectRoute(returnDestination)).toBe(
      '/sign-up?redirect_url=%2Fpricing%3Fplan%3Dannual',
    );
  });

  it('builds practice session routes from the practice base path', () => {
    expect(toPracticeSessionRoute('session_123')).toBe(
      '/app/practice/session_123',
    );
  });
});
