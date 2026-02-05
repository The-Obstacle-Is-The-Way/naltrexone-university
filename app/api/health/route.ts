import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { createHealthHandler } from './handler';

const rateLimiter = new DrizzleRateLimiter(db);

const handlePost = createHealthHandler({
  db,
  logger,
  rateLimiter,
  now: () => new Date(),
});

export async function POST(req: Request) {
  return handlePost(req);
}
