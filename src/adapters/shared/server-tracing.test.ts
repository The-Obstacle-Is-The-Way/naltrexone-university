import { describe, expect, it } from 'vitest';
import {
  projectSafeSpanAttributes,
  SERVER_SPAN_FAMILIES,
} from './server-tracing';

describe('server tracing', () => {
  it('registers exactly the five pinned instrumentation families', () => {
    expect(Object.keys(SERVER_SPAN_FAMILIES)).toEqual([
      'finalizeExamAnswers',
      'getBookmarks',
      'getUserStats',
      'getAttemptedQuestions',
      'stripe',
    ]);
  });

  it('projects hostile inputs to only allowlisted attribute keys and shapes', () => {
    const attributes = projectSafeSpanAttributes({
      'app.action': 'getBookmarks',
      'app.route': '/api/stripe/webhook',
      'app.operation': 'stripe.subscriptions.retrieve',
      'app.duration_ms': 125.5,
      'app.count': 12,
      'app.error_code': 'INTERNAL_ERROR',
      'db.statement': 'select * from users where email = $1',
      'db.postgresql.constraint': 'users_email_uq',
      params: ['sentinel@example.com'],
      message: 'duplicate key value exposes raw message',
      stack: 'Error: raw stack',
      cause: { detail: 'raw cause detail' },
      userId: '11111111-1111-1111-1111-111111111111',
      stripeCustomerId: 'cus_secret',
      'app.unknown': 'raw arbitrary value',
    });

    expect(attributes).toEqual({
      'app.action': 'getBookmarks',
      'app.route': '/api/stripe/webhook',
      'app.operation': 'stripe.subscriptions.retrieve',
      'app.duration_ms': 125.5,
      'app.count': 12,
      'app.error_code': 'INTERNAL_ERROR',
    });

    const serialized = JSON.stringify(attributes);
    expect(serialized).not.toContain('select *');
    expect(serialized).not.toContain('users_email_uq');
    expect(serialized).not.toContain('sentinel@example.com');
    expect(serialized).not.toContain('duplicate key');
    expect(serialized).not.toContain('raw stack');
    expect(serialized).not.toContain('raw cause');
    expect(serialized).not.toContain('11111111');
    expect(serialized).not.toContain('cus_secret');
    expect(serialized).not.toContain('arbitrary');

    expect(() =>
      projectSafeSpanAttributes(
        new Proxy(
          {},
          {
            get() {
              throw new Error('hostile accessor');
            },
          },
        ),
      ),
    ).not.toThrow();
  });

  it('drops invalid values even when their keys are allowlisted', () => {
    expect(
      projectSafeSpanAttributes({
        'app.action': 'user_11111111-1111-1111-1111-111111111111',
        'app.route': '/api/stripe/webhook?user=sentinel@example.com',
        'app.operation': 'stripe.customers.retrieve',
        'app.duration_ms': Number.POSITIVE_INFINITY,
        'app.count': 1.5,
        'app.error_code': '23505',
      }),
    ).toEqual({});
  });
});
