import pino from 'pino';
import type { Logger } from '@/src/application/ports/logger';

export function createSerializedLogger(): { lines: string[]; logger: Logger } {
  const lines: string[] = [];
  const logger = pino(
    { level: 'debug', base: null, timestamp: false },
    {
      write: (line: string) => {
        lines.push(line);
      },
    },
  );
  return { lines, logger };
}
