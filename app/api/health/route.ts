import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST() {
  try {
    // Test DB connectivity
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      ok: true,
      db: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Database connection failed',
      },
      { status: 500 },
    );
  }
}
