# DEBT-061: Timezone Not Explicitly Enforced at Application Level

## Category: Data Consistency

## Summary
While the database schema uses `withTimezone: true` on timestamp columns, there's no explicit UTC enforcement at the application level. Timestamps rely on PostgreSQL's `defaultNow()` which uses the server's timezone setting.

## Location
- `db/schema.ts` - Various timestamp columns
- Application code - `new Date()` calls

## Current State
```typescript
// Schema - uses server timezone for defaults
createdAt: timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow(),
```

Application code uses `new Date()` without explicit timezone handling:
```typescript
// Could be local timezone depending on environment
const now = new Date();
```

## Potential Issues
1. If PostgreSQL server timezone changes, `defaultNow()` behavior changes
2. Development (local timezone) vs production (likely UTC) inconsistency
3. Date comparisons in domain services may behave differently across environments
4. Daylight saving time edge cases

## Impact
- **Edge case bugs:** Timezone-related bugs on DST boundaries
- **Environment inconsistency:** Dev works differently than prod
- **Data quality:** Mixed timezone data if server config changes

## Effort: Low-Medium
Requires audit of all `new Date()` usage and timestamp handling.

## Recommended Fix
1. Document timezone policy (UTC everywhere)
2. Create a utility function:
   ```typescript
   // lib/time.ts
   export function utcNow(): Date {
     return new Date();
   }

   export function toUTC(date: Date): Date {
     return new Date(date.toISOString());
   }
   ```
3. Use consistent timezone in all date operations
4. Consider setting PostgreSQL timezone explicitly:
   ```sql
   SET timezone = 'UTC';
   ```

## Related
- Domain services using Date (statistics.ts, entitlement.ts)
