import { redactSensitiveE2EText } from './e2e-log-redaction';

type WriteCallback = (error?: Error | null) => void;

export type E2EWritableStream = {
  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean;
};

const redactingStreams = new WeakSet<E2EWritableStream>();

/**
 * BUG-330: Playwright's runner shows the E2E web server's output, which can
 * carry Clerk's development token and Stripe IDs, and CI logs are public. Each
 * chunk the stream writes passes the E2E log redaction first. A credential
 * split across two chunks would pass; the runner writes whole lines.
 */
export function installE2EStreamRedaction(stream: E2EWritableStream): void {
  if (redactingStreams.has(stream)) return;
  redactingStreams.add(stream);
  const write = stream.write.bind(stream);
  stream.write = (chunk, encodingOrCallback, callback) => {
    const text =
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(
            typeof encodingOrCallback === 'string'
              ? encodingOrCallback
              : 'utf8',
          );
    const done =
      typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    return write(redactSensitiveE2EText(text), done);
  };
}
