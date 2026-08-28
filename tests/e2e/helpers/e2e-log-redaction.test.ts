import { describe, expect, it } from 'vitest';
import {
  installE2ELogRedaction,
  redactSensitiveE2EText,
} from './e2e-log-redaction';

const LOG_METHOD_NAMES = ['debug', 'error', 'info', 'log', 'warn'] as const;

type CapturedLog = {
  method: (typeof LOG_METHOD_NAMES)[number];
  values: unknown[];
};

function createFakeLogTarget() {
  const captured: CapturedLog[] = [];
  function capture(method: CapturedLog['method']) {
    return (...values: unknown[]) => {
      captured.push({ method, values });
    };
  }
  const target = {
    debug: capture('debug'),
    error: capture('error'),
    info: capture('info'),
    log: capture('log'),
    warn: capture('warn'),
  };

  return { captured, target };
}

describe('installE2ELogRedaction', () => {
  it('redacts Clerk browser credentials from every console channel', () => {
    const fake = createFakeLogTarget();
    installE2ELogRedaction(fake.target);

    for (const method of LOG_METHOD_NAMES) {
      fake.target[method](
        'request ?__clerk_db_jwt=dev-browser-value&next=1 ' +
          '__clerk_testing_token=testing-value; __session=session-value; ' +
          '__clerk_handshake=handshake-value',
      );
    }

    expect(fake.captured).toEqual(
      LOG_METHOD_NAMES.map((method) => ({
        method,
        values: [
          'request ?__clerk_db_jwt=[redacted]&next=1 ' +
            '__clerk_testing_token=[redacted]; __session=[redacted]; ' +
            '__clerk_handshake=[redacted]',
        ],
      })),
    );
  });

  it('redacts every standing Stripe TEST object identifier shape', () => {
    const prefixes = [
      'cus',
      'sub',
      'clock',
      'acct',
      'req',
      'seti',
      'si',
      'pm',
      'in',
      'price',
      'cs',
      'evt',
      'sk_test',
    ];
    const input = prefixes
      .map((prefix) => `${prefix}_${['example', '123'].join('')}`)
      .join(' ');

    const redacted = redactSensitiveE2EText(input);
    const unredactedShapeRemains =
      /\b(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+\b/.test(
        redacted,
      );

    expect(unredactedShapeRemains).toBe(false);
    expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(prefixes.length);
  });

  it('preserves non-sensitive text and non-string arguments', () => {
    const fake = createFakeLogTarget();
    const context = { status: 'closed' };
    installE2ELogRedaction(fake.target);

    fake.target.warn('route.fetch: Test ended', context);

    expect(fake.captured).toEqual([
      {
        method: 'warn',
        values: ['route.fetch: Test ended', context],
      },
    ]);
  });

  it('does not wrap a log target more than once', () => {
    const fake = createFakeLogTarget();
    installE2ELogRedaction(fake.target);
    const wrappedWarn = fake.target.warn;
    installE2ELogRedaction(fake.target);

    expect(fake.target.warn).toBe(wrappedWarn);
    fake.target.warn('?__clerk_db_jwt=dev-browser-value');

    expect(fake.captured).toEqual([
      {
        method: 'warn',
        values: ['?__clerk_db_jwt=[redacted]'],
      },
    ]);
  });

  it('reinstalls when the test runner restores a console method', () => {
    const fake = createFakeLogTarget();
    const originalWarn = fake.target.warn;
    installE2ELogRedaction(fake.target);
    fake.target.warn = originalWarn;

    installE2ELogRedaction(fake.target);
    fake.target.warn('?__clerk_db_jwt=dev-browser-value');

    expect(fake.captured).toEqual([
      {
        method: 'warn',
        values: ['?__clerk_db_jwt=[redacted]'],
      },
    ]);
  });
});
