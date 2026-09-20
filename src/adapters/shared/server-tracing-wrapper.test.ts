import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SERVER_SPAN_FAMILIES, startServerSpan } from './server-tracing';

type RecordedSpan = {
  name: string;
  op: string;
  attributes: Record<string, string | number>;
  updates: Record<string, string | number>[];
};

// This SDK-boundary spy records emitted telemetry and invokes the callback;
// it does not claim to reproduce Sentry's transport or tracing internals.
const spans = vi.hoisted(() => [] as RecordedSpan[]);
vi.mock('@sentry/nextjs', () => ({
  startSpan: <T>(
    options: Omit<RecordedSpan, 'updates'>,
    callback: (span: {
      setAttributes: (fields: Record<string, string | number>) => void;
    }) => T,
  ): T => {
    const recorded: RecordedSpan = { ...options, updates: [] };
    spans.push(recorded);
    return callback({
      setAttributes: (fields) => recorded.updates.push(fields),
    });
  },
}));

beforeEach(() => {
  spans.length = 0;
});

describe('startServerSpan', () => {
  it.each([
    [
      SERVER_SPAN_FAMILIES.finalizeExamAnswers,
      'action.finalizeExamAnswers',
      'server.action',
      { 'app.action': 'finalizeExamAnswers' },
    ],
    [
      SERVER_SPAN_FAMILIES.getBookmarks,
      'action.getBookmarks',
      'server.action',
      { 'app.action': 'getBookmarks' },
    ],
    [
      SERVER_SPAN_FAMILIES.getUserStats,
      'action.getUserStats',
      'server.action',
      { 'app.action': 'getUserStats' },
    ],
    [
      SERVER_SPAN_FAMILIES.getAttemptedQuestions,
      'action.getAttemptedQuestions',
      'server.action',
      { 'app.action': 'getAttemptedQuestions' },
    ],
    [
      SERVER_SPAN_FAMILIES.stripe.parent,
      'stripe.webhook.process',
      'stripe.webhook',
      { 'app.route': '/api/stripe/webhook' },
    ],
    [
      SERVER_SPAN_FAMILIES.stripe.subscriptionRetrieve,
      'stripe.api.subscriptions.retrieve',
      'stripe.api',
      { 'app.operation': 'stripe.subscriptions.retrieve' },
    ],
  ] as const)(
    'preserves the emitted metadata for %j',
    (family, name, op, attributes) => {
      startServerSpan(family, {}, () => undefined);

      expect(spans).toEqual([{ name, op, attributes, updates: [] }]);
    },
  );

  it('filters disallowed initial fields at runtime, not only at typecheck', () => {
    const fields = {
      'app.count': 2,
      'app.duration_ms': 12.5,
      email: 'private@example.invalid',
      'db.statement': 'private query',
    };

    startServerSpan(SERVER_SPAN_FAMILIES.getBookmarks, fields, () => undefined);

    expect(spans[0]?.attributes).toEqual({
      'app.action': 'getBookmarks',
      'app.count': 2,
      'app.duration_ms': 12.5,
    });
  });

  it('filters disallowed later-set fields at runtime', () => {
    startServerSpan(SERVER_SPAN_FAMILIES.getBookmarks, {}, (span) => {
      const fields = { 'app.count': 3, email: 'private@example.invalid' };
      span.setAttributes(fields);
    });

    expect(spans[0]?.updates).toEqual([{ 'app.count': 3 }]);
  });

  it('keeps the runtime value checks on later-set fields', () => {
    startServerSpan(SERVER_SPAN_FAMILIES.getUserStats, {}, (span) => {
      span.setAttributes({ 'app.count': -1, 'app.duration_ms': Number.NaN });
    });

    expect(spans[0]?.updates).toEqual([{}]);
  });

  it('preserves the application error annotation', () => {
    startServerSpan(SERVER_SPAN_FAMILIES.stripe.parent, {}, (span) => {
      span.setAttributes({ 'app.error_code': 'STRIPE_ERROR' });
    });

    expect(spans[0]?.updates).toEqual([{ 'app.error_code': 'STRIPE_ERROR' }]);
  });

  it('returns the callback result without changing promise identity', () => {
    const result = Promise.resolve({ count: 2 });

    expect(
      startServerSpan(SERVER_SPAN_FAMILIES.getBookmarks, {}, () => result),
    ).toBe(result);
  });

  it('preserves the callback error', () => {
    const error = new Error('callback failed');

    expect(() =>
      startServerSpan(SERVER_SPAN_FAMILIES.getBookmarks, {}, () => {
        throw error;
      }),
    ).toThrow(error);
  });

  it('exposes only the filtered attribute setter to the callback', () => {
    startServerSpan(SERVER_SPAN_FAMILIES.getBookmarks, {}, (span) => {
      expect(Object.keys(span)).toEqual(['setAttributes']);
    });
  });

  // These assertions are enforced by pnpm typecheck, not Vitest's runtime.
  it('rejects unregistered families at the type boundary', () => {
    expectTypeOf<{
      name: 'unregistered';
      op: 'server.action';
      action: 'unknown';
    }>().not.toExtend<Parameters<typeof startServerSpan>[0]>();
  });

  it('rejects unknown fields at the type boundary', () => {
    expectTypeOf<{ email: string }>().not.toExtend<
      Parameters<typeof startServerSpan>[1]
    >();
  });

  it('rejects an invalid count shape at the type boundary', () => {
    expectTypeOf<{ 'app.count': string }>().not.toExtend<
      Parameters<typeof startServerSpan>[1]
    >();
  });
});
