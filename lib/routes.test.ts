import { describe, expect, it } from 'vitest';
import { ROUTES, toPracticeSessionRoute, toQuestionRoute } from './routes';

describe('lib/routes', () => {
  it('builds question routes from a slash-free base constant', () => {
    expect(ROUTES.APP_QUESTIONS).toBe('/app/questions');
    expect(toQuestionRoute('opioid-use-disorder')).toBe(
      '/app/questions/opioid-use-disorder',
    );
  });

  it('supports origin query parameters for question routes', () => {
    expect(toQuestionRoute('opioid-use-disorder', { from: 'review' })).toBe(
      '/app/questions/opioid-use-disorder?from=review',
    );
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

  it('supports history origin query parameters for question routes', () => {
    expect(toQuestionRoute('opioid-use-disorder', { from: 'history' })).toBe(
      '/app/questions/opioid-use-disorder?from=history',
    );
  });
});
