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
  return ip && ip.length > 0 ? ip : 'unknown';
}
