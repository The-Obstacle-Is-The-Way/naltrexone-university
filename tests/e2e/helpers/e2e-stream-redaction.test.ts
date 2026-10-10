import { describe, expect, it } from 'vitest';
import {
  flushE2EStreamRedaction,
  installE2EStreamRedaction,
  installRunnerStreamRedaction,
} from './e2e-stream-redaction';

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

describe('a credential split across writes (#1452 review)', () => {
  it('is redacted when its parts arrive in separate writes', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);

    stream.write('[WebServer] GET /v1/client?__clerk_db_jwt=dvb_abcd');
    stream.write('efghijklmnop for cu');
    stream.write('s_ABC123\n');

    expect(stream.written.join('')).toBe(
      '[WebServer] GET /v1/client?__clerk_db_jwt=[redacted] for cus_[REDACTED]\n',
    );
  });

  it('writes a line that ends in a newline at once', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);

    stream.write('[WebServer] ready\n');

    expect(stream.written).toEqual(['[WebServer] ready\n']);
  });

  it('still calls back when a write is held whole', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);
    let calledBack = false;

    stream.write('dvb_abcd', () => {
      calledBack = true;
    });

    expect(calledBack).toBe(true);
  });

  it('writes what it holds, redacted, when flushed', () => {
    const stream = new RecordingStream();
    installE2EStreamRedaction(stream);

    stream.write('last word __clerk_db_jwt=dvb_abcdefghijklmnop');
    flushE2EStreamRedaction(stream);

    expect(stream.written.join('')).toBe('last word __clerk_db_jwt=[redacted]');
  });
});

describe('installRunnerStreamRedaction', () => {
  const token = '__clerk_db_jwt=dvb_abcdefghijklmnop';

  it("redacts each of the runner's streams", () => {
    const out = new RecordingStream();
    const err = new RecordingStream();
    installRunnerStreamRedaction({}, [out, err], () => undefined);

    out.write(`${token}\n`);
    err.write(`${token}\n`);

    expect([...out.written, ...err.written]).toEqual([
      '__clerk_db_jwt=[redacted]\n',
      '__clerk_db_jwt=[redacted]\n',
    ]);
  });

  // Vitest imports the Playwright config to check its policy and keeps its
  // own output.
  it('leaves the streams alone under Vitest', () => {
    const out = new RecordingStream();
    installRunnerStreamRedaction({ VITEST: 'true' }, [out], () => undefined);

    out.write(token);

    expect(out.written).toEqual([token]);
  });

  it('writes what each stream holds when the runner exits', () => {
    const out = new RecordingStream();
    let onExit: (() => void) | undefined;
    installRunnerStreamRedaction({}, [out], (flush) => {
      onExit = flush;
    });

    out.write('tail __clerk_db_jwt=dvb_abcdefghijklmnop');
    const beforeExit = out.written.join('');
    onExit?.();

    expect(beforeExit).toBe('tail ');
    expect(out.written.join('')).toBe('tail __clerk_db_jwt=[redacted]');
  });
});
