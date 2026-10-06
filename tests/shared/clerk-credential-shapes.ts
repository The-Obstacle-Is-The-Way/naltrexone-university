// BUG-305, BUG-307, BUG-328: what a Clerk development-instance credential
// looks like in CI output. E2E log redaction and the scan that gates the
// Playwright failure-output upload both use this one definition, so what one
// removes the other looks for. Matching a shape is a heuristic for the forms
// Clerk's tokens take in URLs, cookies, headers and JSON; finding none does
// not prove a text is free of credentials.
//
// No word boundaries: in a percent-encoded URL a credential follows `%3F` or
// `%3D`, whose last character is a word character.

const PARAMETER_NAMES =
  '__clerk_db_jwt|__clerk_handshake|__clerk_testing_token|__session';
// A value ends at a raw delimiter or a percent-encoded one, so a value that
// holds another percent escape is still removed whole.
const VALUE_CHARACTER = `(?:(?!%26|%3B|%20|%22|%27|%29)[^&;\\s)"'])`;
const REDACTED = '[redacted]';

// A credential carried as a query or cookie parameter, unless redacted.
const parameter = () =>
  new RegExp(
    `(${PARAMETER_NAMES})(=|%3D)(?!\\[redacted\\])${VALUE_CHARACTER}+`,
    'gi',
  );
// A dev-browser token on its own.
const devBrowserToken = () => /dvb_[A-Za-z0-9]{8,}/g;
// A run of token characters and dots, which holds any JSON Web Token.
const tokenRun = () => /[A-Za-z0-9_.-]+/g;

export type ClerkCredentialCounts = {
  parameter: number;
  devBrowserToken: number;
  jsonWebToken: number;
};

// A JSON Web Token, such as a session token or a handshake payload, is three
// dot-separated base64url segments, the first two encoding JSON objects, so
// each starts with `eyJ`. A regular expression for it rescans long runs of
// token characters from every position, in quadratic time. Splitting the run
// on its dots and checking neighbouring segments is linear, and finds a token
// wherever it starts within the run. Overlapping candidates merge into one
// span, so a look-alike segment in front of a token cannot leave part of it.
function jsonWebTokenSpans(run: string): [number, number][] {
  const segments = run.split('.');
  const offsets: number[] = [];
  let offset = 0;
  for (const segment of segments) {
    offsets.push(offset);
    offset += segment.length + 1;
  }
  const spans: [number, number][] = [];
  for (let i = 0; i + 2 < segments.length; i += 1) {
    const header = segments[i] ?? '';
    const payload = segments[i + 1] ?? '';
    const at = header.indexOf('eyJ');
    if (
      at < 0 ||
      header.length - at < 11 ||
      !payload.startsWith('eyJ') ||
      payload.length < 11
    ) {
      continue;
    }
    const start = (offsets[i] ?? 0) + at;
    const stop = (offsets[i + 2] ?? 0) + (segments[i + 2] ?? '').length;
    const last = spans.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], stop);
    else spans.push([start, stop]);
  }
  return spans;
}

function redactJsonWebTokens(text: string): string {
  return text.replace(tokenRun(), (run) => {
    let result = '';
    let end = 0;
    for (const [start, stop] of jsonWebTokenSpans(run)) {
      result += run.slice(end, start) + REDACTED;
      end = stop;
    }
    return result + run.slice(end);
  });
}

export function redactClerkCredentials(text: string): string {
  return redactJsonWebTokens(
    text
      .replace(parameter(), `$1$2${REDACTED}`)
      .replace(devBrowserToken(), REDACTED),
  );
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
  return {
    parameter: (plain.match(parameter()) ?? []).length,
    devBrowserToken: (plain.match(devBrowserToken()) ?? []).length,
    jsonWebToken: (plain.match(tokenRun()) ?? []).reduce(
      (count, run) => count + jsonWebTokenSpans(run).length,
      0,
    ),
  };
}
