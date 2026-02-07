import { db } from '@/lib/db';
import { logger as appLogger } from '@/lib/logger';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { createHealthHandler } from './handler';

const rateLimiter = new DrizzleRateLimiter(db, () => new Date(), appLogger);

export async function POST(req: Request) {
  const ctx = createRequestContext();
  const logger = getRequestLogger(ctx);

  const handlePost = createHealthHandler({
    db,
    logger,
    rateLimiter,
    now: () => new Date(),
  });

  return handlePost(req);
}
