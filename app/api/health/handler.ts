import { type SQLWrapper, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import type { Logger } from '@/src/application/ports/logger';

export type HealthHandlerDeps = {
  db: {
    execute: (query: string | SQLWrapper) => unknown;
  };
  logger: Logger;
  now: () => Date;
};

export function createHealthHandler(deps: HealthHandlerDeps) {
  return async function POST() {
    try {
      await deps.db.execute(sql`SELECT 1`);

      return NextResponse.json({
        ok: true,
        db: true,
        timestamp: deps.now().toISOString(),
      });
    } catch (error) {
      deps.logger.error({ error }, 'Health check failed');
      return NextResponse.json(
        {
          ok: false,
          error: 'Database connection failed',
        },
        { status: 500 },
      );
    }
  };
}
