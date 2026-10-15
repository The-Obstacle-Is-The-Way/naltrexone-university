import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONSOLE_METHODS,
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
    assert: record('assert'),
    count: record('count'),
    debug: record('debug'),
    dir: record('dir'),
    dirxml: record('dirxml'),
    error: record('error'),
    group: record('group'),
    groupCollapsed: record('groupCollapsed'),
    info: record('info'),
    log: record('log'),
    table: record('table'),
    timeEnd: record('timeEnd'),
    timeLog: record('timeLog'),
    trace: record('trace'),
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

  it('records a late call to every console method that writes', async () => {
    const { sink } = createRecordingSink();

    const result = failOnLateConsoleOutput(async () => {
      sink.assert(false, 'late assert');
      for (const method of CONSOLE_METHODS)
        if (method !== 'assert') sink[method]('late');
    }, sink);

    await expect(result).rejects.toThrow(
      `${CONSOLE_METHODS.length} console calls came after this file's last test`,
    );
    for (const method of CONSOLE_METHODS)
      await expect(result).rejects.toThrow(`console.${method}: `);
  });

  it('ignores a console.assert that holds, which writes nothing', async () => {
    const { sink, forwarded } = createRecordingSink();

    await expect(
      failOnLateConsoleOutput(async () => {
        sink.assert(true, 'holds');
      }, sink),
    ).resolves.toBeUndefined();
    expect(forwarded).toEqual([{ method: 'assert', args: [true, 'holds'] }]);
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

  it('catches console calls from a dynamic import still loading when the file ends', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'dir').mockImplementation(() => undefined);

    const loading = import('./late-console-output-probe');
    const result = failOnLateConsoleOutput(() => vi.dynamicImportSettled());

    await expect(result).rejects.toThrow(
      'console.warn: late-console-output-probe evaluated while the file ended',
    );
    await expect(result).rejects.toThrow(
      'console.dir: {"probe":"late-console-output-probe"}',
    );
    await loading;
  });
});
