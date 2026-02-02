# DEBT-060: No Rollback Migrations

## Category: Database Governance

## Summary
Database migrations have no corresponding rollback/down scripts. If a migration needs to be reverted (production emergency, failed deploy), manual cleanup is required.

## Location
- `db/migrations/0000_jazzy_vermin.sql` - Initial schema, no rollback
- `db/migrations/0001_attempts_selected_choice_not_null.sql` - Constraint change, no rollback

## Current State
All migrations are one-way (UP only). Drizzle-kit generates forward migrations but no reverse.

## Impact
- **Deployment risk:** Cannot safely rollback schema changes
- **Emergency response:** Incidents require manual SQL intervention
- **Development friction:** Can't easily test migration reversibility

## Effort: Medium
Requires creating reverse migrations for each existing migration.

## Recommended Fix
1. Create `db/migrations/0000_jazzy_vermin_down.sql` with DROP statements
2. Create `db/migrations/0001_down.sql`:
   ```sql
   ALTER TABLE "attempts" DROP CONSTRAINT "attempts_selected_choice_id_choices_id_fk";
   ALTER TABLE "attempts" ALTER COLUMN "selected_choice_id" DROP NOT NULL;
   -- Re-add original FK constraint
   ```
3. Document rollback procedure in `docs/runbooks/`
4. Consider using migration tool that tracks up/down automatically

## Alternative
Document that rollbacks are handled via point-in-time recovery from database backups instead of SQL rollbacks.

## Related
- SPEC-004: Database schema
- ADR for migration strategy (if exists)
