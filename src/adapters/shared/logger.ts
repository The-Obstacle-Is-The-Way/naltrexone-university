export type LoggerContext = Record<string, unknown>;

export type Logger = {
  debug: (context: LoggerContext, msg: string) => void;
  info: (context: LoggerContext, msg: string) => void;
  warn: (context: LoggerContext, msg: string) => void;
  error: (context: LoggerContext, msg: string) => void;
};
