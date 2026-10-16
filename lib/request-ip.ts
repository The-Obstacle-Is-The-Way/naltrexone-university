export function getClientIp(headers: Pick<Headers, 'get'>): string {
  const vercelForwardedFor = headers.get('x-vercel-forwarded-for')?.trim();
  const allowFallbackForwardedHeaders = process.env.NODE_ENV !== 'production';
  const forwardedFor = allowFallbackForwardedHeaders
    ? headers.get('x-forwarded-for')?.trim()
    : undefined;
  const realIp = allowFallbackForwardedHeaders
    ? headers.get('x-real-ip')?.trim()
    : undefined;

  const headerValue = vercelForwardedFor || forwardedFor || realIp;

  const ip = headerValue?.split(',')[0]?.trim();
  // 'unknown' is one bucket shared by every unreadable address. Webhook and
  // health-check limits keep it as a fail-safe for machine endpoints
  // (DEBT-135); the Clerk call limit skips its per-address limit for it, so
  // people can still sign in.
  return ip && ip.length > 0 ? ip : 'unknown';
}
