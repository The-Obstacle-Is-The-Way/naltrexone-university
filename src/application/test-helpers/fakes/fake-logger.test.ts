import { describe, expect, it } from 'vitest';
import { FakeLogger } from './fake-logger';

describe('FakeLogger', () => {
  it('records calls for each log level', () => {
    const logger = new FakeLogger();

    logger.debug({ debug: true }, 'debug');
    logger.info({ info: true }, 'info');
    logger.warn({ warn: true }, 'warn');
    logger.error({ error: true }, 'error');

    expect(logger.debugCalls).toEqual([
      { context: { debug: true }, msg: 'debug' },
    ]);
    expect(logger.infoCalls).toEqual([
      { context: { info: true }, msg: 'info' },
    ]);
    expect(logger.warnCalls).toEqual([
      { context: { warn: true }, msg: 'warn' },
    ]);
    expect(logger.errorCalls).toEqual([
      { context: { error: true }, msg: 'error' },
    ]);
  });
});
