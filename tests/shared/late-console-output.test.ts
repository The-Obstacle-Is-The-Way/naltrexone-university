import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ConsoleSink,
  failOnLateConsoleOutput,
} from './late-console-output';

function createRecordingSink() {
  const written: string[] = [];
  const record =
    (method: keyof ConsoleSink) =>
    (...args: unknown[]) => {
      written.push(`${method}: ${args.join(' ')}`);
    };
  const sink: ConsoleSink = {
    debug: record('debug'),
    error: record('error'),
    info: record('info'),
    log: record('log'),
    warn: record('warn'),
  };
  return { sink, written };
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

  it('still writes each late call through, so its output stays in the log', async () => {
    const { sink, written } = createRecordingSink();

    await failOnLateConsoleOutput(async () => {
      sink.info('late info');
    }, sink).catch(() => undefined);

    expect(written).toEqual(['info: late info']);
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
