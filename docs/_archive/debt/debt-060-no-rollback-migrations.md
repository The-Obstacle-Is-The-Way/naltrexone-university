# DEBT-060: No Rollback Migrations

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Drizzle Kit migrations in `db/migrations/*.sql` are forward-only. There is no supported “down migration” mechanism in the current toolchain.

## Resolution

We explicitly document the intended rollback strategy (fix-forward and PITR/snapshots when necessary) rather than maintaining ad-hoc down scripts.

See: `docs/dev/database-rollbacks.md`

## Verification

- [x] Rollback strategy documented: `docs/dev/database-rollbacks.md`
- [ ] Production: validate PITR/snapshot procedures with the chosen Postgres provider (Neon)

