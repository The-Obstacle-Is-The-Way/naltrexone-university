import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxyInvocation } from './next-proxy-invocation';

describe('proxyInvocation', () => {
  it('builds a real request for a protected app route by default', () => {
    const [request, event] = proxyInvocation();

    expect(request).toBeInstanceOf(NextRequest);
    expect(request.nextUrl.pathname).toBe('/app/dashboard');
    expect(event).toBeInstanceOf(NextFetchEvent);
  });

  it('builds a real request for the given URL, keeping its search params', () => {
    const [request] = proxyInvocation(
      'https://example.com/checkout/success?session_id=cs_test_xxx',
    );

    expect(request.nextUrl.pathname).toBe('/checkout/success');
    expect(request.nextUrl.searchParams.get('session_id')).toBe('cs_test_xxx');
  });
});
