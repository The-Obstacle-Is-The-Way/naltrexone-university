import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';
import generation from './drizzle.generate.config';

// Prefer `.env.local` for developer-specific secrets, with `.env` as a fallback.
// Never override explicitly provided environment variables.
config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default {
  ...generation,
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
