import { describe, expect, it } from 'vitest';
import { ROUTES, toPracticeSessionRoute, toQuestionRoute } from './routes';

describe('lib/routes', () => {
  it('builds question routes from a slash-free base constant', () => {
    expect(ROUTES.APP_QUESTIONS).toBe('/app/questions');
    expect(toQuestionRoute('opioid-use-disorder')).toBe(
      '/app/questions/opioid-use-disorder',
    );
  });

  it('builds practice session routes from the practice base path', () => {
    expect(toPracticeSessionRoute('session_123')).toBe(
      '/app/practice/session_123',
    );
  });
});
