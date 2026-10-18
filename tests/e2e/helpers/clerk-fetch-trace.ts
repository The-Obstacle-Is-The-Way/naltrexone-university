import { redactSensitiveE2EText } from './e2e-log-redaction';

type RequestDetails = {
  method: string;
  url: string;
  resourceType: string;
  headers: Record<string, string>;
};

// Project before retaining anything. Arbitrary headers, bodies, query values
// and action IDs never enter the trace, even if they have no known token shape.
function requestPlace(url: string): string {
  const parsed = new URL(url);
  const known =
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.hostname.endsWith('.accounts.dev');
  return redactSensitiveE2EText(
    known
      ? `${parsed.host}${parsed.pathname.replace(/\/([a-z]+)_[A-Za-z0-9]{8,}/g, '/$1_…')}`
      : parsed.host,
  );
}

function flags(request: RequestDetails): string {
  return `resource=${request.resourceType} action=${'next-action' in request.headers ? 'yes' : 'no'} rsc=${'rsc' in request.headers ? 'yes' : 'no'}`;
}

function cookieLengths(header: string | undefined): string {
  if (header === undefined) return 'unavailable';
  return (
    header
      .split(';')
      .flatMap((pair) => {
        const separator = pair.indexOf('=');
        if (separator < 0) return [];
        const name = pair.slice(0, separator).trim();
        if (
          !/^__clerk_db_jwt(?:_[\w-]{8})?$|^__session(?:_[\w-]{8})?$|^__client_uat(?:_[\w-]{8})?$/.test(
            name,
          )
        )
          return [];
        return [`${name} length=${pair.slice(separator + 1).trim().length}`];
      })
      .join(', ') || 'none'
  );
}

function decision(value: string | undefined): string | undefined {
  // Clerk's decision is a name, never its arbitrary error message.
  return value && /^[a-z][a-z0-9-]{0,100}$/.test(value) ? value : undefined;
}

export function describeFailedRequest(
  request: RequestDetails & { failure: string },
): string {
  const failure = /^net::ERR_[A-Z_]+$/.test(request.failure)
    ? request.failure
    : `[redacted ${request.failure.length} chars]`;
  return redactSensitiveE2EText(
    `requestfailed ${request.method} ${requestPlace(request.url)} ${flags(request)} failure=${failure}; observed cookies: ${cookieLengths(request.headers.cookie)}`,
  );
}

export function describeFetchAnswer(
  answer: RequestDetails & {
    status: number;
    responseHeaders: Record<string, string>;
  },
): string | null {
  if (!('next-action' in answer.headers) && !('rsc' in answer.headers))
    return null;
  let text = `${answer.method} ${requestPlace(answer.url)} ${answer.status} ${flags(answer)}`;
  const location = answer.responseHeaders.location;
  if (answer.status >= 300 && answer.status < 400 && location) {
    const target = new URL(location, answer.url);
    if (target.origin !== new URL(answer.url).origin)
      text += ` redirect-host=${target.host}`;
  }
  const status = decision(answer.responseHeaders['x-clerk-auth-status']);
  const reason = decision(answer.responseHeaders['x-clerk-auth-reason']);
  if (status) text += ` auth=${status}`;
  if (reason) text += ` reason=${reason}`;
  text += `; observed cookies: ${cookieLengths(answer.headers.cookie)}`;
  return redactSensitiveE2EText(text);
}
