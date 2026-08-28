const LOG_METHOD_NAMES = ['debug', 'error', 'info', 'log', 'warn'] as const;

type LogMethodName = (typeof LOG_METHOD_NAMES)[number];
type LogMethod = (...values: unknown[]) => void;

export type E2ELogTarget = Record<LogMethodName, LogMethod>;

const redactingLogMethods = new WeakSet<LogMethod>();
const SENSITIVE_CLERK_VALUE_PATTERN =
  /\b((?:__clerk_db_jwt|__clerk_handshake|__clerk_testing_token|__session)=)[^&;\s)"']+/g;
const SENSITIVE_STRIPE_IDENTIFIER_PATTERN =
  /\b(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+\b/g;

export function redactSensitiveE2EText(value: string): string {
  return value
    .replace(SENSITIVE_CLERK_VALUE_PATTERN, '$1[redacted]')
    .replace(SENSITIVE_STRIPE_IDENTIFIER_PATTERN, '$1_[REDACTED]');
}

function redactSensitiveLogValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return redactSensitiveE2EText(value);
}

export function installE2ELogRedaction(target: E2ELogTarget): void {
  for (const methodName of LOG_METHOD_NAMES) {
    const currentMethod = target[methodName];
    if (redactingLogMethods.has(currentMethod)) continue;

    const originalMethod = currentMethod.bind(target);
    const redactingMethod: LogMethod = (...values) => {
      originalMethod(...values.map(redactSensitiveLogValue));
    };
    redactingLogMethods.add(redactingMethod);
    target[methodName] = redactingMethod;
  }
}
