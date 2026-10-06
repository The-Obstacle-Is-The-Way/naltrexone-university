// BUG-305, BUG-307, BUG-328: what a Clerk development-instance credential
// looks like in CI output. E2E log redaction and the scan that gates the
// Playwright failure-output upload both use this one definition, so what one
// removes the other looks for.
//
// No word boundaries: in a percent-encoded URL a credential follows `%3F` or
// `%3D`, whose last character is a word character.
//
// A value ends at a raw delimiter or a percent-encoded one, so a value that
// holds another percent escape is still removed whole.
const VALUE_CHARACTER = `(?:(?!%26|%3B|%20|%22|%27|%29)[^&;\\s)"'])`;
// A token starts after a non-token character or a percent escape. Without
// that anchor, a long run of token characters is rescanned from every
// position, which takes quadratic time.
const TOKEN_START = '(?:(?<![A-Za-z0-9_-])|(?<=%[0-9A-Fa-f]{2}))';

const PARAMETER_NAMES =
  '__clerk_db_jwt|__clerk_handshake|__clerk_testing_token|__session';
const REDACTED = '[redacted]';

const shapes = () => ({
  // A credential carried as a query or cookie parameter, unless redacted.
  parameter: new RegExp(
    `(${PARAMETER_NAMES})(=|%3D)(?!\\[redacted\\])${VALUE_CHARACTER}+`,
    'gi',
  ),
  // A dev-browser token on its own.
  devBrowserToken: /dvb_[A-Za-z0-9]{8,}/g,
  // A JSON Web Token, such as a session token or a handshake payload.
  jsonWebToken: new RegExp(
    `${TOKEN_START}eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]*`,
    'g',
  ),
});

export type ClerkCredentialCounts = Record<
  keyof ReturnType<typeof shapes>,
  number
>;

export function redactClerkCredentials(text: string): string {
  const { parameter, devBrowserToken, jsonWebToken } = shapes();
  return text
    .replace(parameter, `$1$2${REDACTED}`)
    .replace(devBrowserToken, REDACTED)
    .replace(jsonWebToken, REDACTED);
}

// Undoes the encodings a credential can carry in text: percent-encoding,
// applied up to twice, and JSON `\u` escapes.
function decoded(text: string): string {
  let result = text;
  for (let pass = 0; pass < 2; pass += 1) {
    result = result.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }
  return result.replace(/\\u([0-9A-Fa-f]{4})/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

export function countClerkCredentials(text: string): ClerkCredentialCounts {
  const plain = decoded(text);
  return Object.fromEntries(
    Object.entries(shapes()).map(([name, shape]) => [
      name,
      (plain.match(shape) ?? []).length,
    ]),
  ) as ClerkCredentialCounts;
}
