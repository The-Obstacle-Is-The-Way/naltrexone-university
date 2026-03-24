import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';
import { ROUTES } from '@/lib/routes';

export function parseSentryIngestOrigin(
  dsn: string | undefined,
): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseSentrySecurityHeaderEndpoint(
  dsn: string | undefined,
  environment?: string,
): string | null {
  if (!dsn) return null;

  try {
    const url = new URL(dsn);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const publicKey = url.username;
    const pathnameSegments = url.pathname.split('/').filter(Boolean);
    const projectId = pathnameSegments.at(-1);
    if (!publicKey || !projectId) {
      return null;
    }

    const pathPrefix = pathnameSegments.slice(0, -1).join('/');
    const endpointPath = pathPrefix
      ? `/${pathPrefix}/api/${projectId}/security/`
      : `/api/${projectId}/security/`;
    const endpoint = new URL(endpointPath, url.origin);
    endpoint.searchParams.set('sentry_key', publicKey);
    const normalizedEnvironment = environment?.trim();
    if (normalizedEnvironment) {
      endpoint.searchParams.set('sentry_environment', normalizedEnvironment);
    }

    return endpoint.toString();
  } catch {
    return null;
  }
}

function mergeCspDirectives(
  baseDirectives: Record<string, string[]>,
  additionalDirectives: Record<string, string[]>,
): Record<string, string[]> {
  return Object.entries(additionalDirectives).reduce<Record<string, string[]>>(
    (mergedDirectives, [directive, values]) => {
      const existingValues = mergedDirectives[directive] ?? [];
      mergedDirectives[directive] = Array.from(
        new Set([...existingValues, ...values]),
      );
      return mergedDirectives;
    },
    { ...baseDirectives },
  );
}

const sentryIngestOrigin = parseSentryIngestOrigin(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
);
const sentryEnvironment =
  process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();
const sentrySecurityHeaderEndpoint = parseSentrySecurityHeaderEndpoint(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  sentryEnvironment,
);

const VERCEL_TOOLBAR_CSP_DIRECTIVES = {
  'script-src': ['https://vercel.live'],
  'connect-src': ['https://vercel.live', 'wss://ws-us3.pusher.com'],
  'img-src': ['https://vercel.live', 'https://vercel.com', 'data:', 'blob:'],
  'frame-src': ['https://vercel.live'],
  'style-src': ['https://vercel.live', "'unsafe-inline'"],
  'font-src': ['https://vercel.live', 'https://assets.vercel.com'],
} satisfies Record<string, string[]>;

const BASE_CLERK_CSP_DIRECTIVES = {
  'base-uri': ['self'],
  'connect-src': [
    'ws:',
    'wss:',
    ...(sentryIngestOrigin ? [sentryIngestOrigin] : []),
  ],
  'font-src': ['self', 'data:', 'https:'],
  'frame-ancestors': ['none'],
  'img-src': ['self', 'data:', 'blob:', 'https:'],
  'object-src': ['none'],
  ...(sentrySecurityHeaderEndpoint
    ? { 'report-uri': [sentrySecurityHeaderEndpoint] }
    : {}),
} satisfies Record<string, string[]>;
const CLERK_CSP_DIRECTIVES =
  process.env.VERCEL_ENV === 'preview'
    ? mergeCspDirectives(
        BASE_CLERK_CSP_DIRECTIVES,
        VERCEL_TOOLBAR_CSP_DIRECTIVES,
      )
    : BASE_CLERK_CSP_DIRECTIVES;

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

  let redirectUrl: URL;
  try {
    const redirectUrlParam = new URL(
      location,
      requestUrl.origin,
    ).searchParams.get('redirect_url');
    if (!redirectUrlParam) return;
    redirectUrl = new URL(redirectUrlParam, requestUrl.origin);
  } catch {
    return;
  }

  if (redirectUrl.origin !== requestUrl.origin) return;
  if (redirectUrl.pathname !== requestUrl.pathname) return;
  if (redirectUrl.search !== requestUrl.search) return;

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
        strict: true,
        reportOnly: true,
        ...(sentrySecurityHeaderEndpoint
          ? { reportTo: sentrySecurityHeaderEndpoint }
          : {}),
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
