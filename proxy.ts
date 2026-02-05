import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';

const CLERK_CSP_DIRECTIVES = {
  'base-uri': ['self'],
  'connect-src': ['ws:', 'wss:'],
  'font-src': ['self', 'data:', 'https:'],
  'frame-ancestors': ['none'],
  'img-src': ['self', 'data:', 'blob:', 'https:'],
  'object-src': ['none'],
} satisfies Record<string, string[]>;

let cachedClerkMiddleware: NextMiddleware | null = null;

async function getClerkMiddleware(): Promise<NextMiddleware> {
  if (cachedClerkMiddleware) return cachedClerkMiddleware;

  const { clerkMiddleware, createRouteMatcher } = await import(
    '@clerk/nextjs/server'
  );

  const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

  const middleware = clerkMiddleware(
    async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    },
    {
      contentSecurityPolicy: {
        directives: CLERK_CSP_DIRECTIVES,
      },
    },
  );

  cachedClerkMiddleware = middleware;
  return middleware;
}

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (process.env.NEXT_PUBLIC_SKIP_CLERK === 'true') {
    return NextResponse.next();
  }

  const clerkMiddleware = await getClerkMiddleware();
  return clerkMiddleware(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
