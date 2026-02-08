import type { Logger, LoggerContext } from '@/src/application/ports/logger';

type LoggerCall = { context: LoggerContext; msg: string };

export class FakeLogger implements Logger {
  readonly debugCalls: LoggerCall[] = [];
  readonly infoCalls: LoggerCall[] = [];
  readonly warnCalls: LoggerCall[] = [];
  readonly errorCalls: LoggerCall[] = [];

  debug(context: LoggerContext, msg: string): void {
    this.debugCalls.push({ context, msg });
  }

  info(context: LoggerContext, msg: string): void {
    this.infoCalls.push({ context, msg });
  }

  warn(context: LoggerContext, msg: string): void {
    this.warnCalls.push({ context, msg });
  }

  error(context: LoggerContext, msg: string): void {
    this.errorCalls.push({ context, msg });
  }
}
