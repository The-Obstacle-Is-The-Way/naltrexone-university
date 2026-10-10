import { redactSensitiveE2EText } from './e2e-log-redaction';

type WriteCallback = (error?: Error | null) => void;

export type E2EWritableStream = {
  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean;
};

const flushers = new WeakMap<E2EWritableStream, () => void>();

// A write's trailing run of characters that can belong to a credential: no
// whitespace and none of the raw delimiters that end a parameter value. It is
// held for the next write, so a credential split across two writes is redacted
// whole. A longer run than any credential is written at once.
const TRAILING_RUN = /[^\s&;)"']+$/;
const MAX_HELD = 16_384;

function decode(
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | WriteCallback,
): string {
  if (typeof chunk === 'string') return chunk;
  return Buffer.from(chunk).toString(
    typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8',
  );
}

/**
 * BUG-330: Playwright's runner shows the E2E web server's output, which can
 * carry Clerk's development token and Stripe IDs, and CI logs are public. Each
 * write passes the E2E log redaction first. Playwright passes on each read of
 * the server's output as it arrives, so a credential can be split across two
 * writes; the run of token characters ending a write is held for the next one,
 * or until the stream is flushed (#1452 review).
 */
export function installE2EStreamRedaction(stream: E2EWritableStream): void {
  if (flushers.has(stream)) return;
  const write = stream.write.bind(stream);
  let held = '';
  stream.write = (chunk, encodingOrCallback, callback) => {
    const text = held + decode(chunk, encodingOrCallback);
    const tail = text.match(TRAILING_RUN)?.[0] ?? '';
    held = tail.length <= MAX_HELD ? tail : '';
    const done =
      typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    return write(
      redactSensitiveE2EText(text.slice(0, text.length - held.length)),
      done,
    );
  };
  flushers.set(stream, () => {
    if (!held) return;
    const rest = held;
    held = '';
    write(redactSensitiveE2EText(rest));
  });
}

/** Writes, redacted, what the stream holds from its last write. */
export function flushE2EStreamRedaction(stream: E2EWritableStream): void {
  flushers.get(stream)?.();
}

/**
 * BUG-330: the Playwright config redacts the runner's own output streams,
 * and writes what they hold when the runner exits, except when Vitest imports
 * the config to check its policy and keeps its own output.
 */
export function installRunnerStreamRedaction(
  env: Record<string, string | undefined>,
  streams: E2EWritableStream[],
  onExit: (flush: () => void) => void = (flush) => {
    process.once('exit', flush);
  },
): void {
  if (env.VITEST) return;
  for (const stream of streams) installE2EStreamRedaction(stream);
  onExit(() => {
    for (const stream of streams) flushE2EStreamRedaction(stream);
  });
}
