// Every Console method that writes. Each sends its output through the same
// channel, so any of them can fail the run during worker shutdown.
export const CONSOLE_METHODS = [
  'assert',
  'count',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'info',
  'log',
  'table',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
] as const;

export type ConsoleSink = Pick<Console, (typeof CONSOLE_METHODS)[number]>;

function describeArgument(argument: unknown): string {
  if (typeof argument === 'string') return argument;
  if (argument instanceof Error) return argument.message;
  try {
    return JSON.stringify(argument) ?? String(argument);
  } catch {
    // A circular value cannot be serialised; its string form still names it.
    return describeUnserialisable(argument);
  }
}

function describeUnserialisable(argument: unknown): string {
  try {
    return String(argument);
  } catch {
    // A null-prototype object has no string form, and describing it must not
    // throw inside the console call it wraps; its tag still names its kind.
    return Object.prototype.toString.call(argument);
  }
}

// The methods' signatures differ, so assigning one through a union key needs
// a key that names the method's own type.
function setMethod<K extends keyof ConsoleSink>(
  sink: ConsoleSink,
  method: K,
  value: ConsoleSink[K],
): void {
  sink[method] = value;
}

/**
 * Waits for `settle`, then fails if anything wrote to the console meanwhile.
 *
 * vitest.unit.setup.ts runs this after each unit-lane file's last test with
 * `vi.dynamicImportSettled()`. Work a test starts and never awaits, such as a
 * page's deferred section loading the real container, can otherwise log while
 * the worker shuts down, and that fails the whole run with
 * `EnvironmentTeardownError`, blaming no test (PR #1522's first CI run).
 */
export async function failOnLateConsoleOutput(
  settle: () => Promise<unknown>,
  sink: ConsoleSink = console,
): Promise<void> {
  const lateCalls: string[] = [];
  // Node's console writes some methods through others (count through log,
  // trace through error), so only the outermost call is recorded.
  let depth = 0;
  const originals = CONSOLE_METHODS.map(
    (method) => [method, sink[method]] as const,
  );
  for (const [method, original] of originals) {
    setMethod(sink, method, (...args: unknown[]) => {
      // console.assert writes only when its assertion fails.
      if (depth === 0 && (method !== 'assert' || !args[0]))
        lateCalls.push(
          `console.${method}: ${args.map(describeArgument).join(' ')}`,
        );
      depth++;
      try {
        Reflect.apply(original, sink, args);
      } finally {
        depth--;
      }
    });
  }

  try {
    await settle();
  } finally {
    for (const [method, original] of originals) {
      setMethod(sink, method, original);
    }
  }

  if (lateCalls.length > 0) {
    throw new Error(
      [
        `${lateCalls.length} console call${lateCalls.length === 1 ? '' : 's'} came after this file's last test, from work the file started and never awaited:`,
        ...lateCalls.map((call) => `  ${call}`),
        'A console call while the worker shuts down fails the whole run (EnvironmentTeardownError). Await the work inside its test, or inject a dependency that does not start it.',
      ].join('\n'),
    );
  }
}
