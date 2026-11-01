// Classification only. Callers retain their own URL, port, database-name and
// authorization rules. Do not widen test-lane access to the whole 127/8 range.
export function isLoopbackHostname(hostname: string): boolean {
  const host =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
