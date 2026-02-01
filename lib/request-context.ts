import 'server-only';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

export type RequestContext = {
  requestId: string;
  userId?: string;
};

export function createRequestContext(
  input?: Partial<RequestContext>,
): RequestContext {
  return {
    requestId: input?.requestId ?? randomUUID(),
    userId: input?.userId,
  };
}

export function getRequestLogger(context: RequestContext) {
  return logger.child({
    requestId: context.requestId,
    ...(context.userId ? { userId: context.userId } : {}),
  });
}
