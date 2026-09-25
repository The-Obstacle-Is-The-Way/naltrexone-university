// `next/server` exports NextFetchEvent as a type only; the class itself lives
// in Next's published fetch-event module, which the runtime constructs from.
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';

// The two arguments Next hands the proxy, built as real objects so the proxy
// reads a parsed `nextUrl` instead of a cast empty object. The default is a
// protected app route, which no public-route or public-resource rule matches.
export function proxyInvocation(
  url = 'https://example.com/app/dashboard',
): [NextRequest, NextFetchEvent] {
  const request = new NextRequest(url);
  return [
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  ];
}
