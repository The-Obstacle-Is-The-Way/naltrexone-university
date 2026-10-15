import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ConsoleSink,
  failOnLateConsoleOutput,
} from './late-console-output';

function createRecordingSink() {
  const forwarded: { method: keyof ConsoleSink; args: unknown[] }[] = [];
  const record =
    (method: keyof ConsoleSink) =>
    (...args: unknown[]) => {
      forwarded.push({ method, args });
    };
  const sink: ConsoleSink = {
    debug: record('debug'),
    error: record('error'),
    info: record('info'),
    log: record('log'),
    warn: record('warn'),
  };
  return { sink, forwarded };
}

describe('failOnLateConsoleOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when the work still settling writes nothing', async () => {
    const { sink } = createRecordingSink();

    await expect(
      failOnLateConsoleOutput(async () => undefined, sink),
    ).resolves.toBeUndefined();
  });

  it('rejects, naming every console call the settling work made', async () => {
    const { sink } = createRecordingSink();

    const result = failOnLateConsoleOutput(async () => {
      sink.error('Invalid environment variables:', {
        DATABASE_URL: 'Required',
      });
      sink.warn(new Error('late warning'));
    }, sink);

    await expect(result).rejects.toThrow(
      /2 console calls came after this file's last test/,
    );
    await expect(result).rejects.toThrow(
      'console.error: Invalid environment variables: {"DATABASE_URL":"Required"}',
    );
    await expect(result).rejects.toThrow('console.warn: late warning');
  });

  it('names a value it cannot serialise by its string form', async () => {
    const { sink } = createRecordingSink();
    const circular: { self?: unknown } = {};
    circular.self = circular;

    await expect(
      failOnLateConsoleOutput(async () => {
        sink.log('late', circular, undefined);
      }, sink),
    ).rejects.toThrow('console.log: late [object Object] undefined');
  });

  it('still writes each late call through, so its output stays in the log', async () => {
    const { sink, forwarded } = createRecordingSink();

    await failOnLateConsoleOutput(async () => {
      sink.info('late info');
    }, sink).catch(() => undefined);

    expect(forwarded).toEqual([{ method: 'info', args: ['late info'] }]);
  });

  it('forwards and names a late argument that has no string form', async () => {
    const { sink, forwarded } = createRecordingSink();
    const bare: Record<string, unknown> = Object.create(null);
    bare.self = bare;

    await expect(
      failOnLateConsoleOutput(async () => {
        sink.warn('late', bare);
      }, sink),
    ).rejects.toThrow('console.warn: late [object Object]');
    expect(forwarded).toEqual([{ method: 'warn', args: ['late', bare] }]);
  });

  it('restores the console methods once the work settles, even when it fails', async () => {
    const { sink } = createRecordingSink();
    const originals = { ...sink };

    await expect(
      failOnLateConsoleOutput(async () => {
        throw new Error('settle failed');
      }, sink),
    ).rejects.toThrow('settle failed');

    expect({ ...sink }).toEqual(originals);
  });

  it('catches a console call from a dynamic import still loading when the file ends', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const loading = import('./late-console-output-probe');

    await expect(
      failOnLateConsoleOutput(() => vi.dynamicImportSettled()),
    ).rejects.toThrow(
      'console.warn: late-console-output-probe evaluated while the file ended',
    );
    await loading;
  });
});
