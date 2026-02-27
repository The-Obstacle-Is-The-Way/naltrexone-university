import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';
import { ROUTES } from '@/lib/routes';

const CLERK_CSP_DIRECTIVES = {
  'base-uri': ['self'],
  'connect-src': ['ws:', 'wss:'],
  'font-src': ['self', 'data:', 'https:'],
  'frame-ancestors': ['none'],
  'img-src': ['self', 'data:', 'blob:', 'https:'],
  'object-src': ['none'],
} satisfies Record<string, string[]>;

let cachedClerkMiddleware: NextMiddleware | null = null;
let hasLoggedSkipClerkProductionWarning = false;
const CHECKOUT_SUCCESS_PATHNAME = ROUTES.CHECKOUT_SUCCESS;

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function logCheckoutSuccessAuthBounce(
  request: NextRequest,
  response: Response,
): void {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return;
  }

  if (requestUrl.pathname !== CHECKOUT_SUCCESS_PATHNAME) return;
  if (!isRedirectResponse(response)) return;

  const location = response.headers.get('location');
  if (!location) return;

  let redirectUrl: string | null = null;
  try {
    redirectUrl = new URL(location, requestUrl.origin).searchParams.get(
      'redirect_url',
    );
  } catch {
    return;
  }

  if (redirectUrl !== request.url) return;

  console.info({
    event: 'checkout_success_auth_bounce',
    route: CHECKOUT_SUCCESS_PATHNAME,
    hasSessionId: requestUrl.searchParams.has('session_id'),
  });
}

function shouldBypassClerkAuth(): boolean {
  if (process.env.NEXT_PUBLIC_SKIP_CLERK !== 'true') {
    return false;
  }

  const isProduction =
    process.env.VERCEL_ENV === 'production' ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');

  if (isProduction) {
    if (!hasLoggedSkipClerkProductionWarning) {
      hasLoggedSkipClerkProductionWarning = true;
      console.error(
        'CRITICAL: NEXT_PUBLIC_SKIP_CLERK=true in production; ignoring and enforcing Clerk auth.',
      );
    }
    return false;
  }

  return true;
}

async function getClerkMiddleware(): Promise<NextMiddleware> {
  if (cachedClerkMiddleware) return cachedClerkMiddleware;

  const { clerkMiddleware, createRouteMatcher } = await import(
    '@clerk/nextjs/server'
  );

  const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

  const clerkMw = clerkMiddleware(
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

  cachedClerkMiddleware = clerkMw;
  return clerkMw;
}

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (shouldBypassClerkAuth()) {
    return NextResponse.next();
  }

  const clerkMw = await getClerkMiddleware();
  const response = await clerkMw(request, event);
  if (response) {
    logCheckoutSuccessAuthBounce(request, response);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
