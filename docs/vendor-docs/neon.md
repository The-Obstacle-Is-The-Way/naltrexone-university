# Neon Vendor Documentation

**Package:** `@neondatabase/serverless` ^0.10.4
**ORM:** Drizzle ORM `drizzle-orm` ^0.39.1
**Dashboard:** https://console.neon.tech
**Docs:** https://neon.com/docs
**Status:** https://neonstatus.com

---

## Connection Types

### Pooled Connection (Primary)

Use for application queries. Supports up to 10,000 concurrent connections.

```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

**Note the `-pooler` suffix** — this routes through PgBouncer.

### Direct Connection (Migrations Only)

Use for `prisma migrate`, `drizzle-kit push`, schema operations.

```
DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

**No `-pooler` suffix** — direct connection to Postgres.

---

## Serverless Driver

For edge functions (Vercel Edge, Cloudflare Workers), use the Neon serverless driver:

```typescript
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const result = await sql`SELECT * FROM users WHERE id = ${userId}`;
```

**When to use:**
- Vercel Edge Functions
- Cloudflare Workers
- Any environment where WebSockets can't outlive a request

**When NOT to use:**
- Standard Node.js (use `pg` or Drizzle instead)
- Long-running processes

---

## Drizzle Configuration

```typescript
// lib/db.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

For migrations:
```typescript
// drizzle.config.ts
export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};
```

---

## Best Practices

### Always Use Pooled Connections

```typescript
// ✅ Correct — pooled connection
const url = 'postgresql://...@ep-xxx-pooler.region.aws.neon.tech/db';

// ❌ Wrong — direct connection for app queries
const url = 'postgresql://...@ep-xxx.region.aws.neon.tech/db';
```

### Disable Scale-to-Zero for Production

Cold starts add latency. For production:
1. Go to Neon Console → Project Settings
2. Set compute to "Always On" or minimum 1 replica

### Connection Lifecycle

Configure connection pools properly:

```typescript
// node-postgres example
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail fast on connection issues
});
```

### Retry Logic

Network blips happen. Use retry with exponential backoff:

```typescript
async function queryWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 100));
    }
  }
  throw new Error('Unreachable');
}
```

---

## Environment Variables

| Variable | Purpose | Connection Type |
|----------|---------|-----------------|
| `DATABASE_URL` | Application queries | Pooled |
| `DIRECT_URL` | Migrations, schema ops | Direct |

---

## Local Development

### Option 1: Use Neon Dev Branch

Create a `dev` branch in Neon Console. Branches are cheap and isolated.

### Option 2: Local Postgres (Docker)

```bash
# Start local Postgres
pnpm db:test:up

# Use local connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test"
```

---

## Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations (uses DATABASE_URL)
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

---

## Monitoring

### Query Performance

Neon Console shows:
- Query latency (p50, p95, p99)
- Connection count
- Compute usage

### Cold Start Latency

First request after idle period may take 500ms-2s. Mitigate with:
1. Keep-alive requests (cron job)
2. Disable scale-to-zero
3. Use connection pooling (masks some cold starts)

---

## Upgrade Checklist

When upgrading Neon packages:

- [ ] Read [Neon changelog](https://neon.com/docs/changelog) if available
- [ ] Check [GitHub releases](https://github.com/neondatabase/serverless/releases)
- [ ] Test migrations work
- [ ] Test connection pooling
- [ ] Verify Drizzle compatibility
- [ ] Update this doc with new version

---

## Sources

- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling)
- [Choosing Connection Type](https://neon.com/docs/connect/choose-connection)
- [Neon Serverless Driver](https://github.com/neondatabase/serverless)
- [Drizzle + Neon Guide](https://neon.com/docs/guides/drizzle)
