export function getClientIp(headers: Pick<Headers, 'get'>): string {
  const forwardedFor =
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-forwarded-for') ??
    headers.get('x-real-ip');

  const ip = forwardedFor?.split(',')[0]?.trim();
  return ip && ip.length > 0 ? ip : 'unknown';
}
