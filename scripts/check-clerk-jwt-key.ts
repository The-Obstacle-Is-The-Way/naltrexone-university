// DEBT-503 item 5: with CLERK_JWT_KEY, the middleware verifies session tokens
// against that key alone, so a key that is not Clerk's would sign every
// visitor out. This compares it with the keys Clerk publishes for the
// instance, at its Frontend API's `/.well-known/jwks.json`, and fails the
// build on a mismatch. It runs before next build (package.json), which covers
// every Vercel deploy. Without the key it passes and reads nothing.
import { pathToFileURL } from 'node:url';
import {
  matchesPublishedClerkKeys,
  parseClerkJwtKey,
} from '../lib/clerk-jwt-key';

const READ_TIMEOUT_MS = 10_000;

export type ClerkJwtKeyCheck = {
  env: Record<string, string | undefined>;
  readJson: (url: string) => Promise<unknown>;
  output: Pick<Console, 'log' | 'error'>;
};

// The Frontend API host a publishable key names: base64 of the host and `$`.
function frontendApiHost(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  return /^[a-z0-9.-]+\$$/i.test(decoded) ? decoded.slice(0, -1) : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function checkClerkJwtKey({
  env,
  readJson,
  output,
}: ClerkJwtKeyCheck): Promise<number> {
  let key: string | undefined;
  try {
    key = parseClerkJwtKey(env.CLERK_JWT_KEY);
  } catch (error) {
    output.error(messageOf(error));
    return 1;
  }
  if (!key) {
    output.log('CLERK_JWT_KEY is not set: Clerk fetches its signing keys');
    return 0;
  }
  const host = frontendApiHost(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!host) {
    output.error(
      'CLERK_JWT_KEY needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to find the keys Clerk publishes',
    );
    return 1;
  }
  let published: unknown;
  try {
    published = await readJson(`https://${host}/.well-known/jwks.json`);
  } catch (error) {
    output.error(
      `could not read the keys Clerk publishes for ${host}: ${messageOf(error)}`,
    );
    return 1;
  }
  if (!matchesPublishedClerkKeys(key, published)) {
    output.error(`CLERK_JWT_KEY is not a key Clerk publishes for ${host}`);
    return 1;
  }
  output.log(`CLERK_JWT_KEY is a key Clerk publishes for ${host}`);
  return 0;
}

/** Reads the keys Clerk publishes, within a time limit. */
export async function readPublishedKeys(
  url: string,
  fetchKeys: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchKeys(url, {
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** The command line's run: the real environment, console and Clerk. */
export function runFromCommandLine(
  env: Record<string, string | undefined> = process.env,
  output: Pick<Console, 'log' | 'error'> = console,
  readJson: (url: string) => Promise<unknown> = readPublishedKeys,
): Promise<number> {
  return checkClerkJwtKey({ env, readJson, output });
}

/* v8 ignore start */
function setExitCode(code: number): void {
  process.exitCode = code;
}

// No top-level await: tsx runs this repository's scripts as CommonJS.
const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath)
  void runFromCommandLine().then(setExitCode);
/* v8 ignore stop */
