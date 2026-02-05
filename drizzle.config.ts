import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Prefer `.env.local` for developer-specific secrets, with `.env` as a fallback.
// Never override explicitly provided environment variables.
config({ path: '.env.local', override: false });
config({ path: '.env', override: false });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
