# DEBT-264: Documentation Sync

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** Phase 6 documentation sync
**Blocked by:** All code specs (DEBT-251–263) merged

---

## Scope

After all code changes are complete, update docs in lockstep:

### 1. Pattern Registry Part 11

Remove resolved D-items from the divergence table. Only unresolved items or approved exceptions should remain.

### 2. Pattern Registry Part 4

Add/confirm `L-6` (mobile menu link). Ensure mobile-nav classes map to that pattern.

### 3. BS-035

Update line number references and class strings to match post-fix source. Add decision log entries recording each decision outcome.

### 4. Standards §17

Update the divergence ID range to reflect only remaining items. If all resolved, remove the cross-reference section or mark as "historical."

### 5. Pattern Registry Part 5

Document the final CTA strategy (Decision 1 outcome). If an `inverted` variant was added, document it. Document MetallicCtaButton as explicit exception (Decision 2 outcome).

### 6. Pattern Registry Part 10

Update "Needs Extraction" table to reflect completed extractions. Move completed items to "Already Shared."

### 7. Design Principles §2

If Decision 7 adds a bookmark to standalone review, update the action bar composition table.

### 8. Pattern Registry Part 1.2

If Decision 12 accepts light-mode asymmetry, add documentation note about the intentional difference between dark-mode and light-mode hover feedback mechanisms.

### 9. Third-Party Exceptions

If Decision 8 accepts the Clerk visual seam, add a "Third-Party Component Exceptions" section to Pattern Registry Part 5.

### 10. DEBT-250 Progress Table

Update all child spec statuses to "Completed" with PR links.

---

## Verification

```bash
# No stale D-item references in Pattern Registry Part 11
# (manual check — ensure only exceptions remain)

# BS-035 line references match current source
# (spot-check 3-5 references against actual file lines)

# All 13 decisions recorded with outcomes
rg -c 'Decision [0-9]+.*outcome' docs/brainstorming/bs-035-*.md
# Expected: 13 matches (or equivalent decision log format)
```
