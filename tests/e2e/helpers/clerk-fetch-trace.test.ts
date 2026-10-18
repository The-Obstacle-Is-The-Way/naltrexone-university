import { describe, expect, it } from 'vitest';
import { ClerkAuthTrace } from './clerk-auth-trace';
import {
  describeFailedRequest,
  describeFetchAnswer,
} from './clerk-fetch-trace';

describe('failed-fetch diagnostics', () => {
  const request = {
    method: 'POST',
    url: 'http://localhost:3000/app/questions/placeholder?__clerk_db_jwt=query-secret',
    resourceType: 'fetch',
    headers: {
      'next-action': 'action-secret',
      cookie: '__clerk_db_jwt=cookie-secret; __session_Ab1-Cd_2=session-secret',
    },
  };

  it('records a token-bearing request and redirect without query, cookie or action values', () => {
    const trace = new ClerkAuthTrace(() => 0);
    trace.noteAnswer(
      describeFailedRequest({ ...request, failure: 'net::ERR_FAILED' }),
    );
    const answer = describeFetchAnswer({
      ...request,
      status: 307,
      responseHeaders: {
        location:
          'https://example.accounts.dev/private-path?__clerk_db_jwt=location-secret',
        'set-cookie': '__clerk_db_jwt=response-secret',
        'x-clerk-auth-status': 'handshake',
        'x-clerk-auth-reason': 'dev-browser-missing',
      },
    });
    expect(answer).not.toBeNull();
    trace.noteAnswer(answer ?? 'missing answer');
    const output = trace.report('none')?.join('\n') ?? '';

    expect(output).toContain('__clerk_db_jwt length=13');
    expect(output).toContain('__session_Ab1-Cd_2 length=14');
    expect(output).toContain('action=yes');
    expect(output).toContain('redirect-host=example.accounts.dev');
    for (const secret of [
      'query-secret',
      'cookie-secret',
      'session-secret',
      'action-secret',
      'location-secret',
      'response-secret',
      'private-path',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain('?');
  });

  it('identifies a failed server action and its cross-origin redirect at the event times', () => {
    let now = 0;
    const trace = new ClerkAuthTrace(() => now);
    now = 10;
    trace.noteAnswer('Clerk API: GET /v1/environment 200');
    now = 15;
    trace.noteAnswer(
      describeFetchAnswer({
        ...request,
        status: 307,
        responseHeaders: {
          location: 'https://example.accounts.dev/sign-in',
          'x-clerk-auth-reason': 'dev-browser-missing',
        },
      }) ?? 'missing answer',
    );
    now = 20;
    trace.noteAnswer(
      describeFailedRequest({ ...request, failure: 'net::ERR_FAILED' }),
    );
    const output = trace.report('none')?.join('\n');

    expect(output).toContain('+10ms Clerk API: GET /v1/environment 200');
    expect(output).toContain(
      '+15ms POST localhost:3000/app/questions/placeholder 307',
    );
    expect(output).toContain('reason=dev-browser-missing');
    expect(output).toContain(
      '+20ms requestfailed POST localhost:3000/app/questions/placeholder',
    );
    expect(output).toContain(
      'resource=fetch action=yes rsc=no failure=net::ERR_FAILED',
    );
  });

  it('records RSC redirects and excludes unrelated asset responses', () => {
    expect(
      describeFetchAnswer({
        ...request,
        method: 'GET',
        headers: { rsc: '1' },
        status: 302,
        responseHeaders: { location: 'https://other.test/path?secret=value' },
      }),
    ).toContain('action=no rsc=yes redirect-host=other.test');
    expect(
      describeFetchAnswer({
        ...request,
        headers: {},
        status: 302,
        responseHeaders: { location: 'https://other.test/' },
      }),
    ).toBeNull();
  });

  it('keeps same-origin answer status and reason without a redirect host', () => {
    const answer = describeFetchAnswer({
      ...request,
      status: 307,
      responseHeaders: {
        location: '/sign-in?secret=value',
        'x-clerk-auth-status': 'signed-out',
      },
    });
    expect(answer).toContain('auth=signed-out');
    expect(answer).not.toContain('redirect-host');
    expect(answer).not.toContain('secret');
  });

  it('keeps network error codes but never arbitrary failure text or third-party paths', () => {
    const output = describeFailedRequest({
      ...request,
      url: 'https://other.test/private-token?secret=value',
      failure: 'Failed at https://other.test/?unrecognized=secret-value',
    });
    expect(output).toContain('requestfailed POST other.test');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('secret-value');
    expect(output).toContain('failure=[redacted');
  });
});
