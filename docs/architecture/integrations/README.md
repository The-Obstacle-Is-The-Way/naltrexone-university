# Integrations

What this application depends on from its vendors: the API versions it runs, the fields it reads, the breaking changes it has hit, and what to check on an upgrade. Package versions are not copied here; `package.json` and the lockfile own them.

---

## Why This Exists

BUG-045 taught us a painful lesson: Stripe deprecated `subscription.current_period_end` in API version `2025-03-31`, but we didn't know until checkout broke in production. This documentation prevents that from happening again.

**What we track:**
1. **API versions** — what we run, and where each is pinned
2. **Fields we depend on** — So we catch deprecations early
3. **Breaking changes we've hit** — Lessons learned
4. **Migration checklists** — When we upgrade

---

## Where Versions Live

| Vendor | Package version | API version |
|--------|-----------------|-------------|
| Stripe | `stripe` in `package.json` | Pinned in `lib/stripe-api-version.ts` and read by `lib/stripe.ts` |
| Clerk | `@clerk/nextjs` in `package.json` | Chosen by the SDK (`SUPPORTED_BAPI_VERSION` in `@clerk/backend`), not pinned in code ([clerk.md](./clerk.md#api-version)) |
| Postgres | `postgres` in `package.json` | None (driver) |
| Drizzle | `drizzle-orm` and `drizzle-kit` in `package.json` | None |

Stripe's pin covers outbound requests only: each Stripe webhook endpoint has its own version. The live endpoint is at `2026-05-27.dahlia`. The test endpoint inherited the account default `2026-01-28.clover` until its 2026-10-11 rotation, and now uses `2026-05-27.dahlia` explicitly ([census and decision](./stripe.md#webhook-endpoint-api-versions)).

---

## Vendor Index

| Vendor | Doc | Critical Fields | Known Issues |
|--------|-----|-----------------|--------------|
| [Stripe](./stripe.md) | Payment processing | `subscription.items.data[].current_period_end` | BUG-045 |
| [Clerk](./clerk.md) | Authentication | `userId`, `primaryEmailAddressId`, `emailAddresses[]`, `updatedAt/updated_at` | None |
| [Postgres](./postgres.md) | Database | Connection pooling | None |

---

## Upgrade Checklist Template

[Updating dependencies](../../guides/dependencies/updating-dependencies.md) is the procedure for every upgrade. For a vendor SDK or API version, also:

1. **Read changelog** — Check for breaking changes affecting fields we use
2. **Search codebase** — `grep -r "fieldName"` for deprecated fields
3. **Update vendor doc** — Record the new API version, and any migration it needed
4. **Test locally** — Run full test suite
5. **Test in preview** — Deploy to Vercel preview, test critical paths
6. **Monitor production** — Watch logs for 24h after deploy

---

## See Also

- `docs/records/` — Bug and debt records (may reference vendor issues)
- `docs/adr/` — Architecture decisions (may affect vendor choices)
