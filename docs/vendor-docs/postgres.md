# Postgres Vendor Documentation

**Driver Package:** `postgres` ^3.4.8
**ORM:** `drizzle-orm` ^0.45.1
**Hosting:** Neon (serverless Postgres)
**Dashboard:** https://console.neon.tech
**Driver Docs:** https://github.com/porsager/postgres

---

## Our Setup

We use the `postgres` package (porsager/postgres) directly with Drizzle ORM — **not** `@neondatabase/serverless`.

```typescript
// lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const conn = postgres(env.DATABASE_URL, {
  connection: { TimeZone: 'UTC' },
});
export const db = drizzle(conn, { schema });
```

---

## Connection Types

### Pooled Connection (Primary)

Use for all application queries. The `-pooler` suffix routes through PgBouncer.

```text
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

### Direct Connection (Migrations)

Use for `drizzle-kit push`, schema operations. No `-pooler` suffix.

```text
DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

---

## Singleton Pattern

We use a singleton to avoid creating multiple connections in development (hot reload):

```typescript
const globalForDb = globalThis as unknown as { conn: postgres.Sql | undefined };

const conn = globalForDb.conn ?? postgres(connectionString, options);
if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Application queries (pooled) | Yes |

**Note:** We use a single `DATABASE_URL` for both queries and migrations. For large schema changes, consider adding a `DIRECT_URL` for migrations.

---

## Local Development

### Option 1: Use Neon Dev Branch

Create a `dev` branch in Neon Console. Branches are isolated and cheap.

### Option 2: Local Postgres (Docker)

```bash
# Start local Postgres
pnpm db:test:up

# Run with local connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test"
```

---

## Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio

# Seed database
pnpm db:seed
```

---

## Connection Options

From `lib/db-connection-options.ts`:

```typescript
export const POSTGRES_CONNECTION_PARAMETERS = {
  TimeZone: 'UTC',
} as const;
```

We set `TimeZone: 'UTC'` to ensure consistent timestamp handling regardless of server timezone.

---

## Neon-Specific Notes

### Scale-to-Zero

Neon can pause computes after inactivity. First request after pause has cold start latency (500ms-2s).

**For production:** Consider disabling scale-to-zero or using keep-alive requests.

### Connection Limits

- Pooled connections: Up to 10,000 concurrent
- Direct connections: Limited by compute size

### Branching

Neon supports database branches for:
- Development environments
- Preview deployments
- Testing migrations safely

---

## Upgrade Checklist

When upgrading `postgres` or `drizzle-orm`:

- [ ] Check [postgres changelog](https://github.com/porsager/postgres/releases)
- [ ] Check [Drizzle changelog](https://github.com/drizzle-team/drizzle-orm/releases)
- [ ] Test migrations work
- [ ] Test queries work
- [ ] Update this doc with new version

---

## Sources

- [postgres.js GitHub](https://github.com/porsager/postgres)
- [Drizzle + Postgres.js](https://orm.drizzle.team/docs/get-started-postgresql#postgresjs)
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling)
