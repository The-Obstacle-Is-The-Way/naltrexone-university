import type { Config } from 'drizzle-kit';

// Migration generation is offline: do not load dotenv or database credentials.
export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
} satisfies Config;
