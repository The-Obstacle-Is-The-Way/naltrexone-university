import { db } from '@/lib/db';
import { logger as appLogger } from '@/lib/logger';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { createHealthHandler } from './handler';

const rateLimiter = new DrizzleRateLimiter(db, () => new Date(), appLogger);

export const maxDuration = 10;

function buildHandler() {
  const ctx = createRequestContext();
  const logger = getRequestLogger(ctx);

  return createHealthHandler({
    db,
    logger,
    rateLimiter,
  });
}

export async function GET(req: Request) {
  const handler = buildHandler();
  return handler.GET(req);
}

export async function POST(req: Request) {
  const handler = buildHandler();
  return handler.POST(req);
}
