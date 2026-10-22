import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { projectSafeErrorDiagnostics } from './safe-error-diagnostics';

describe('projectSafeErrorDiagnostics', () => {
  it('projects only class, application code, SQLSTATE, and constraint from a cause chain', () => {
    const postgresError = Object.assign(
      new Error('duplicate key value exposes raw cause text'),
      {
        code: '23505',
        constraint: 'users_email_uq',
        detail: 'Key (email)=(sentinel@example.com) already exists',
        hint: 'raw hint',
        arbitrary: 'raw arbitrary value',
      },
    );
    const drizzleError = new DrizzleQueryError(
      'insert into users (email) values ($1)',
      ['sentinel@example.com'],
      postgresError,
    );
    const applicationError = Object.assign(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to ensure user row',
        undefined,
        { cause: drizzleError },
      ),
      { arbitrary: 'outer arbitrary value' },
    );

    const diagnostics = projectSafeErrorDiagnostics(applicationError);

    expect(diagnostics).toEqual({
      name: 'ApplicationError',
      code: 'INTERNAL_ERROR',
      sqlState: '23505',
      constraint: 'users_email_uq',
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('sentinel@example.com');
    expect(serialized).not.toContain('insert into users');
    expect(serialized).not.toContain('duplicate key');
    expect(serialized).not.toContain('raw hint');
    expect(serialized).not.toContain('arbitrary');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('params');
  });

  it('projects an ordinary error class without its raw values', () => {
    const error = Object.assign(new TypeError('raw message'), {
      detail: 'raw detail',
    });

    expect(projectSafeErrorDiagnostics(error)).toEqual({
      name: 'TypeError',
    });
  });

  it('returns an empty projection for non-error values', () => {
    expect(
      projectSafeErrorDiagnostics({ raw: 'sentinel@example.com' }),
    ).toEqual({});
  });

  it('bounds traversal of a cyclic cause chain', () => {
    const cyclicError = new Error('raw cyclic message');
    Object.assign(cyclicError, { cause: cyclicError });

    expect(() => projectSafeErrorDiagnostics(cyclicError)).not.toThrow();
    expect(projectSafeErrorDiagnostics(cyclicError)).toEqual({
      name: 'Error',
    });
  });

  it('does not inspect causes beyond the traversal depth limit', () => {
    const tooDeepPostgresError = Object.assign(
      new Error('raw cause beyond the depth limit'),
      {
        code: '23505',
        constraint: 'too_deep_constraint',
      },
    );
    let causeChain: unknown = tooDeepPostgresError;
    for (let depth = 0; depth < 8; depth += 1) {
      causeChain = { cause: causeChain };
    }

    expect(projectSafeErrorDiagnostics(causeChain)).toEqual({});
  });

  it('does not throw when error proxy traps reject diagnostic reads', () => {
    const hostileError = new Proxy(
      {},
      {
        get() {
          throw new Error('raw get trap failure');
        },
        getPrototypeOf() {
          throw new Error('raw prototype trap failure');
        },
        has() {
          throw new Error('raw has trap failure');
        },
      },
    );

    expect(() => projectSafeErrorDiagnostics(hostileError)).not.toThrow();
    expect(projectSafeErrorDiagnostics(hostileError)).toEqual({});
  });

  it('keeps safe fields available when other error accessors throw', () => {
    const hostileError = new Error('raw hostile message');
    Object.defineProperties(hostileError, {
      cause: {
        get() {
          throw new Error('raw cause accessor failure');
        },
      },
      code: {
        get() {
          throw new Error('raw code accessor failure');
        },
      },
      constraint: {
        get() {
          throw new Error('raw constraint accessor failure');
        },
      },
      constraint_name: { value: 'safe_constraint_name' },
      constructor: {
        get() {
          throw new Error('raw constructor accessor failure');
        },
      },
    });

    expect(() => projectSafeErrorDiagnostics(hostileError)).not.toThrow();
    expect(projectSafeErrorDiagnostics(hostileError)).toEqual({
      constraint: 'safe_constraint_name',
    });
  });
});

describe('vendor diagnostics allow-list', () => {
  it('retains safe Stripe diagnostics through an application cause without raw text', () => {
    const cause = Object.assign(new Error('private Stripe response'), {
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      requestId: 'req_synthetic123',
      statusCode: 404,
    });
    const diagnostics = projectSafeErrorDiagnostics(
      new ApplicationError('STRIPE_ERROR', 'private wrapper', undefined, {
        cause,
      }),
    );
    expect(diagnostics).toMatchObject({
      code: 'STRIPE_ERROR',
      vendorType: 'StripeInvalidRequestError',
      vendorCode: 'resource_missing',
      requestId: 'req_synthetic123',
      statusCode: 404,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('private');
  });
  it('drops unreviewed vendor strings and malformed request identifiers', () => {
    expect(
      projectSafeErrorDiagnostics(
        Object.assign(new Error('private'), {
          type: 'private',
          code: 'customer_supplied_text',
          requestId: 'req_token?secret=private',
          statusCode: 999,
        }),
      ),
    ).toEqual({ name: 'Error' });
  });
  it('reports a five-letter network code as a network code, not a SQLSTATE', () => {
    expect(
      projectSafeErrorDiagnostics(
        Object.assign(new Error('private'), { code: 'EPIPE' }),
      ),
    ).toEqual({ name: 'Error', networkCode: 'EPIPE' });
  });
});
