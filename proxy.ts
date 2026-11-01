import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';
import {
  type ClerkBackendCallLimit,
  limitClerkBackendCalls,
  loadContainerOperationalAlerts,
  loadContainerRateLimiter,
  raiseLimiterFailureAlert,
  raiseOperationalAlert,
  triggersClerkBackendCall,
} from '@/lib/clerk-backend-call-limit';
import {
  clerkCallFailure,
  reportClerkCallFailure,
} from '@/lib/clerk-call-failures';
import { parseClerkJwtKey } from '@/lib/clerk-jwt-key';
import {
  CRON_ROUTE_PATHS,
  PUBLIC_RESOURCE_PATHS,
  PUBLIC_ROUTE_PATTERNS,
} from '@/lib/public-routes';
import { ROUTES } from '@/lib/routes';
import { sentryEnvironmentFor } from '@/lib/sentry-data-collection';
import { HTTP_UNAUTHORIZED } from '@/src/adapters/shared/http-status';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type {
  OperationalAlertKind,
  OperationalAlerts,
} from '@/src/application/ports/operational-alerts';

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
const sentryEnvironment = sentryEnvironmentFor(process.env.VERCEL_ENV);
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

// DEBT-503 item 5: with Clerk's signing key, the middleware verifies session
// tokens without fetching keys from Clerk's Backend API, whose outage would
// sign every visitor out, and which any token naming an unknown key ID calls. `@clerk/nextjs` does not read
// CLERK_JWT_KEY itself. An unreadable key is logged and left out, so Clerk
// fetches its keys as before; the production build refuses one.
function configuredClerkJwtKey(): string | undefined {
  try {
    return parseClerkJwtKey(process.env.CLERK_JWT_KEY);
  } catch (error) {
    console.error({
      event: 'clerk_jwt_key_unreadable',
      reason: projectSafeErrorDiagnostics(error),
    });
    return undefined;
  }
}

// Read once per server instance, so Clerk and BUG-323's limiter (DEBT-503
// item 4) check session tokens with the same key.
let clerkJwtKey: { value: string | undefined } | undefined;

function readClerkJwtKey(): string | undefined {
  clerkJwtKey ??= { value: configuredClerkJwtKey() };
  return clerkJwtKey.value;
}

function clerkJwtKeyOption(): { jwtKey?: string } {
  const jwtKey = readClerkJwtKey();
  return jwtKey ? { jwtKey } : {};
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
      ...clerkJwtKeyOption(),
      contentSecurityPolicy: {
        directives: CLERK_CSP_DIRECTIVES,
        strict: true,
        // ⚠️ Keep `reportOnly: true`. Do NOT flip to `false` (enforcing).
        // Clerk strict mode uses a per-request nonce + 'strict-dynamic', which is
        // fundamentally incompatible with this app's Next 16 PPR / Cache Components:
        // prerendered static-shell <script> tags cannot carry the per-request nonce,
        // so enforcing blocks first-party /_next/static/chunks and breaks the app
        // (verified via live Sentry + a production-build experiment + Next/Clerk docs).
        // Real enforcement would require a separate non-nonce host-allowlist policy.
        // See DEBT-420.
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

function usesProductionClerkInstance(): boolean {
  return (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') ===
    true
  );
}

const REFUSAL_ALERTS: Partial<
  Record<ClerkBackendCallLimit, OperationalAlertKind>
> = {
  site: 'clerk_site_limit_reached',
  'signed-in-address': 'clerk_signed_in_limit_reached',
};

export type ProxyDependencies = {
  loadBackendCallLimiter: () => Promise<RateLimiter>;
  loadOperationalAlerts: () => Promise<OperationalAlerts>;
};

export function createProxy({
  loadBackendCallLimiter,
  loadOperationalAlerts,
}: ProxyDependencies) {
  return async function proxy(request: NextRequest, event: NextFetchEvent) {
    // The cron routes check CRON_SECRET themselves and need no Clerk session,
    // so Clerk never reads their Authorization header.
    if (CRON_ROUTE_PATHS.includes(request.nextUrl?.pathname)) {
      return NextResponse.next();
    }

    // BUG-369: Clerk's middleware reads a token from any Authorization header
    // and can spend its Backend API on it, refreshing a genuine expired
    // session token or verifying an API-key or machine token, uncounted by
    // BUG-323's limits. No page or browser request to the app sends the
    // header, so any other request carrying it is refused, before Clerk and
    // before the public resources too: only the cron routes take it.
    if (request.headers.has('authorization')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: HTTP_UNAUTHORIZED },
      );
    }

    // These exact public machine resources must not require even Clerk's
    // anonymous dev-browser handshake, which redirects HTML requests.
    if (
      PUBLIC_RESOURCE_PATHS.some((path) => path === request.nextUrl?.pathname)
    ) {
      return NextResponse.next();
    }

    if (shouldBypassClerkAuth()) {
      return NextResponse.next();
    }

    // BUG-323: limit requests that make Clerk call its Backend API, whose
    // limit every signed-in page shares, before Clerk sees them. Only a
    // production instance: a development instance handshakes every new browser
    // session, so E2E, local work and Preview would trip the limit.
    if (usesProductionClerkInstance() && triggersClerkBackendCall(request)) {
      const limited = await limitClerkBackendCalls(
        request,
        loadBackendCallLimiter,
        (failure) => {
          console.error(failure);
          // DEBT-505: alert after the response, so the request never waits
          // on the database that just failed.
          event.waitUntil(raiseLimiterFailureAlert(loadOperationalAlerts));
        },
        (limit) => {
          // DEBT-503 item 3: each refusal is logged for diagnosis. The owner
          // hears of two, after the response: the site-wide limit, and (item
          // 4) one address's refreshes of sessions Clerk signed, which turned
          // away people on a shared network. One client over its own limit,
          // a signed-in session's included, is the limit working, and needs
          // no one.
          console.warn({ event: 'clerk_backend_call_refused', limit });
          const kind = REFUSAL_ALERTS[limit];
          if (kind) {
            event.waitUntil(raiseOperationalAlert(loadOperationalAlerts, kind));
          }
        },
        readClerkJwtKey(),
      );
      if (limited) return limited;
    }

    const clerkMw = await getClerkMiddleware();
    const response = await clerkMw(request, event);
    if (response) {
      logCheckoutSuccessAuthBounce(request, response);
      // DEBT-503 item 3: Clerk's middleware swallows Clerk failing its own
      // calls; its answer still says which, and the owner hears of it after
      // the response. Only production's allowance is at stake.
      const failure = usesProductionClerkInstance()
        ? clerkCallFailure(request, response)
        : null;
      if (failure) {
        event.waitUntil(
          reportClerkCallFailure(failure, {
            loadLimiter: loadBackendCallLimiter,
            loadAlerts: loadOperationalAlerts,
          }),
        );
      }
    }

    return response;
  };
}

export default createProxy({
  loadBackendCallLimiter: loadContainerRateLimiter,
  loadOperationalAlerts: loadContainerOperationalAlerts,
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
