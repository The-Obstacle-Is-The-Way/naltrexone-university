const LOG_METHOD_NAMES = ['debug', 'error', 'info', 'log', 'warn'] as const;

type LogMethodName = (typeof LOG_METHOD_NAMES)[number];
type LogMethod = (...values: unknown[]) => void;

export type E2ELogTarget = Record<LogMethodName, LogMethod>;

const installedTargets = new WeakSet<E2ELogTarget>();
const SENSITIVE_CLERK_VALUE_PATTERN =
  /\b((?:__clerk_db_jwt|__clerk_testing_token|__session)=)[^&;\s)"']+/g;

function redactSensitiveLogValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(SENSITIVE_CLERK_VALUE_PATTERN, '$1[redacted]');
}

export function installE2ELogRedaction(target: E2ELogTarget): void {
  if (installedTargets.has(target)) return;

  for (const methodName of LOG_METHOD_NAMES) {
    const originalMethod = target[methodName].bind(target);
    target[methodName] = (...values) => {
      originalMethod(...values.map(redactSensitiveLogValue));
    };
  }

  installedTargets.add(target);
}
