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

  it('never treats failed-request provisional cookies as evidence of what was sent', () => {
    const output = describeFailedRequest({
      ...request,
      failure: 'net::ERR_FAILED',
    });
    expect(output).toContain(
      'cookies unavailable (failed-request headers may be provisional; not evidence of missing cookies)',
    );
    expect(output).not.toContain('__clerk_db_jwt length=');
    expect(
      describeFetchAnswer({
        ...request,
        status: 307,
        responseHeaders: { location: 'https://other.test/' },
      }),
    ).toContain(
      'request cookies (response observed): __clerk_db_jwt length=13',
    );
  });

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
    expect(output).toContain('+15ms POST localhost:3000/app/questions/… 307');
    expect(output).toContain('reason=dev-browser-missing');
    expect(output).toContain(
      '+20ms requestfailed POST localhost:3000/app/questions/…',
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

  it('keeps Chromium error codes that contain digits', () => {
    expect(
      describeFailedRequest({
        ...request,
        failure: 'net::ERR_HTTP2_PROTOCOL_ERROR',
      }),
    ).toContain('failure=net::ERR_HTTP2_PROTOCOL_ERROR');
  });

  it("names only Clerk's own decisions and reduces any other value to its length", () => {
    const answer = describeFetchAnswer({
      ...request,
      status: 307,
      responseHeaders: {
        location: 'https://example.accounts.dev/sign-in',
        'x-clerk-auth-status': 'handshake',
        'x-clerk-auth-reason': 'looks-like-a-reason',
      },
    });
    expect(answer).toContain('auth=handshake');
    expect(answer).toContain('reason length=19');
    expect(answer).not.toContain('looks-like-a-reason');
  });

  it('shows the numeric __client_uat a request sent, and only the length of anything else', () => {
    const answer = describeFetchAnswer({
      ...request,
      headers: {
        'next-action': 'action-secret',
        cookie:
          '__client_uat=0; __client_uat_Ab1-Cd_2=1792630704; __session=session-secret',
      },
      status: 307,
      responseHeaders: {
        'x-clerk-auth-status': 'signed-out',
        'x-clerk-auth-reason': 'session-token-but-no-client-uat',
      },
    });
    expect(answer).toContain(
      'reason=session-token-but-no-client-uat; request cookies (response observed): __client_uat=0, __client_uat_Ab1-Cd_2=1792630704, __session length=14',
    );
    expect(
      describeFetchAnswer({
        ...request,
        headers: { rsc: '1', cookie: '__client_uat=not-a-time' },
        status: 200,
        responseHeaders: {},
      }),
    ).toContain('__client_uat length=10');
  });

  it("keeps only the app's and Clerk's route words from a request path", () => {
    const failed = (url: string) =>
      describeFailedRequest({ ...request, url, failure: 'net::ERR_FAILED' });

    const unknown = failed('http://localhost:3000/account/opaque-secret-value');
    expect(unknown).toContain('requestfailed POST localhost:3000/…/… ');
    expect(unknown).not.toContain('opaque-secret-value');
    expect(
      failed(
        'http://localhost:3000/app/practice/7f9c2b1e-4d3a-4f6b-9a8e-1c2d3e4f5a6b',
      ),
    ).toContain('requestfailed POST localhost:3000/app/practice/… ');
    expect(
      failed(
        'https://example.accounts.dev/v1/client/sessions/sess_2abcDEF345ghi/tokens',
      ),
    ).toContain(
      'requestfailed POST example.accounts.dev/v1/client/sessions/sess_…/tokens ',
    );
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
