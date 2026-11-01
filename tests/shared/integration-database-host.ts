import { isLoopbackHostname } from '../../scripts/lib/loopback-hostname';

// postgres.js 3.4.9 parses `postgresql://…@[::1]:5432/…` with host "[", so no
// bracketed IPv6 target can connect (BUG-358). Say so rather than calling a
// loopback host non-local.
export function integrationDatabaseHostProblem(
  hostname: string,
  allowNonLocal: boolean,
): string | undefined {
  if (hostname.startsWith('['))
    return `postgres.js cannot connect to the IPv6 address ${hostname} in DATABASE_URL. Use 127.0.0.1 or localhost (BUG-358).`;
  if (!allowNonLocal && !isLoopbackHostname(hostname))
    return `Refusing to run integration tests against non-local DATABASE_URL host "${hostname}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`;
  return undefined;
}
