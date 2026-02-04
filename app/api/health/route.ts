import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createHealthHandler } from './handler';

const handlePost = createHealthHandler({
  db,
  logger,
  now: () => new Date(),
});

export async function POST() {
  return handlePost();
}
