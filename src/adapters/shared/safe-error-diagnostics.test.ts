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
});
