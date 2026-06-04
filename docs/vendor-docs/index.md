# Vendor Documentation

**Purpose:** Single source of truth for all external dependencies — API versions, breaking changes we've hit, fields we depend on, and migration paths.

**Last Updated:** 2026-06-04

---

## Why This Exists

BUG-045 taught us a painful lesson: Stripe deprecated `subscription.current_period_end` in API version `2025-03-31`, but we didn't know until checkout broke in production. This documentation prevents that from happening again.

**What we track:**
1. **Pinned API versions** — What we're running
2. **Fields we depend on** — So we catch deprecations early
3. **Breaking changes we've hit** — Lessons learned
4. **Migration checklists** — When we upgrade

---

## Version Matrix

| Vendor | Package | Our Version | API Version | Last Verified |
|--------|---------|-------------|-------------|---------------|
| Stripe | `stripe` | ^22.2.0 | `2026-05-27.dahlia` | 2026-06-04 |
| Clerk | `@clerk/nextjs` | ^7.0.7 | `2024-10-01` | 2026-03-28 |
| Postgres | `postgres` | ^3.4.8 | N/A (driver) | 2026-03-17 |
| Drizzle | `drizzle-orm` | ^0.45.1 | N/A | 2026-03-17 |

Package versions above were reconciled against `package.json` on 2026-06-04.
Stripe's API version is pinned in `lib/stripe.ts`. Clerk's API version remains a
tracked vendor setting rather than a local code constant.

---

## Vendor Index

| Vendor | Doc | Critical Fields | Known Issues |
|--------|-----|-----------------|--------------|
| [Stripe](./stripe.md) | Payment processing | `subscription.items.data[].current_period_end` | BUG-045 |
| [Clerk](./clerk.md) | Authentication | `userId`, `primaryEmailAddressId`, `emailAddresses[]`, `updatedAt/updated_at` | None |
| [Postgres](./postgres.md) | Database | Connection pooling | None |

---

## Upgrade Checklist Template

When upgrading any vendor:

1. **Read changelog** — Check for breaking changes affecting fields we use
2. **Search codebase** — `grep -r "fieldName"` for deprecated fields
3. **Update vendor doc** — Record new version, any migrations needed
4. **Test locally** — Run full test suite
5. **Test in preview** — Deploy to Vercel preview, test critical paths
6. **Monitor production** — Watch logs for 24h after deploy

---

## See Also

- `docs/bugs/` — Bug reports (may reference vendor issues)
- `docs/adr/` — Architecture decisions (may affect vendor choices)
