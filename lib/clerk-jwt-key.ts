import { createPublicKey, type KeyObject } from 'node:crypto';

// DEBT-503 item 5: with `jwtKey`, Clerk's middleware verifies session tokens
// without fetching Clerk's signing keys from the Backend API. `@clerk/backend`
// 3.18.1 reads that key by stripping the PEM's newlines, header and trailer,
// then this fixed prefix and suffix of a 2048-bit RSA key with exponent 65537,
// and takes what remains as the modulus. A key it misreads would fail every
// token, so only a key it reads exactly is accepted.
const PEM_HEADER = '-----BEGIN PUBLIC KEY-----';
const PEM_TRAILER = '-----END PUBLIC KEY-----';
const RSA_PREFIX = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA';
const RSA_SUFFIX = 'IDAQAB';

function publicKeyFrom(pem: string): KeyObject | undefined {
  if (!pem.startsWith(PEM_HEADER) || !pem.endsWith(PEM_TRAILER)) {
    return undefined;
  }
  try {
    return createPublicKey(pem);
  } catch {
    return undefined;
  }
}

// Clerk's own reading of the key, as `loadClerkJwkFromPem` does it.
function modulusAsClerkReadsIt(pem: string): string {
  return pem
    .replace(/\r\n|\n|\r/g, '')
    .replace(PEM_HEADER, '')
    .replace(PEM_TRAILER, '')
    .replace(RSA_PREFIX, '')
    .replace(RSA_SUFFIX, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * The configured key in the form Clerk reads, or undefined when none is set.
 * A key pasted on one line with escaped newlines has them restored. Throws
 * for anything Clerk could not read exactly; the message holds no key.
 */
export function parseClerkJwtKey(raw: string | undefined): string | undefined {
  const pem = raw?.trim().replaceAll('\\n', '\n');
  if (!pem) return undefined;
  const key = publicKeyFrom(pem);
  if (!key) throw new Error('CLERK_JWT_KEY is not a public key in PEM form');
  const jwk = key.export({ format: 'jwk' });
  if (
    key.asymmetricKeyType !== 'rsa' ||
    jwk.e !== 'AQAB' ||
    modulusAsClerkReadsIt(pem) !== jwk.n
  ) {
    throw new Error('CLERK_JWT_KEY is not an RSA 2048 key Clerk can read');
  }
  return pem;
}

/**
 * Whether the configured key is one Clerk publishes for the instance, in the
 * JSON Web Key Set its Frontend API serves at `/.well-known/jwks.json`.
 */
export function matchesPublishedClerkKeys(
  pem: string,
  published: unknown,
): boolean {
  const keys =
    published && typeof published === 'object' && 'keys' in published
      ? published.keys
      : undefined;
  if (!Array.isArray(keys)) return false;
  const { n, e } = createPublicKey(pem).export({ format: 'jwk' });
  return keys.some(
    (key: unknown) =>
      typeof key === 'object' &&
      key !== null &&
      'n' in key &&
      'e' in key &&
      key.n === n &&
      key.e === e,
  );
}
