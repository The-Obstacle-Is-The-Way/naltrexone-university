import { describe, expect, it } from 'vitest';
import { installE2EStreamRedaction } from './e2e-stream-redaction';

// BUG-330: the E2E web server's output reaches CI logs, which are public, so
// everything Playwright's runner writes passes the E2E log redaction.
class RecordingStream {
  readonly written: string[] = [];
  readonly callbacks: string[] = [];

  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    this.written.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'),
    );
    const done =
      typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    done?.();
    return true;
  }
}

describe('installE2EStreamRedaction', () => {
  it('redacts a Clerk development token and a Stripe ID in text', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);

    stream.write(
      '[WebServer] GET /v1/client?__clerk_db_jwt=dvb_abcdefghijklmnop for cus_ABC123\n',
    );

    expect(stream.written).toEqual([
      '[WebServer] GET /v1/client?__clerk_db_jwt=[redacted] for cus_[REDACTED]\n',
    ]);
  });

  it('redacts a chunk written as bytes, and keeps the write callback', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);
    let called = false;

    stream.write(Buffer.from('token dvb_abcdefghijklmnop\n'), 'utf8', () => {
      called = true;
    });

    expect(stream.written).toEqual(['token [redacted]\n']);
    expect(called).toBe(true);
  });

  it('passes other text through unchanged, and installs only once', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);
    installE2EStreamRedaction(stream);

    stream.write('  ✓ 12 [chromium] › practice.spec.ts (3.1s)\n');

    expect(stream.written).toEqual([
      '  ✓ 12 [chromium] › practice.spec.ts (3.1s)\n',
    ]);
  });
});
