# DEBT-264: Documentation Sync

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** Phase 6 documentation sync
**Blocked by:** All code specs (DEBT-251–263) merged
**Files:** `docs/frontend/pattern-registry.md`, `docs/frontend/standards.md`, `docs/frontend/design-principles.md`, `docs/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md`, `docs/debt/debt-250-frontend-visual-divergence-compliance-plan.md`, `docs/debt/index.md`

---

## Scope

After all code changes are complete, update docs in lockstep:

### 1. Pattern Registry Part 11

Remove resolved D-items from the divergence table. Only unresolved items or approved exceptions should remain.

### 2. Pattern Registry Part 4

Confirm `L-6` (mobile menu link) remains canonical and matches the final Decision 10 outcome.

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

### 8. Pattern Registry Part 1.2 (includes DEBT-262 fold-in)

**Decision 12 resolved: Option C (accept asymmetry).** DEBT-262 is documentation-only and folds into this task.

Refine the Part 1.2 light-mode caveat to:
- Explicitly state the two-channel hover strategy: fills for dark mode, borders for light mode
- Note that any new interactive row component must include at least one non-fill hover cue (border, shadow, or text color)
- Remove the "See DEBT-250 LIGHT-1 / Decision 12 for resolution strategy" reference and replace with the resolved wording
- Cross-reference DEBT-260 (UX-1) for the targeted hover border fixes on dashboard/history rows

### 9. Third-Party Exceptions

If Decision 8 accepts the Clerk visual seam, add a "Third-Party Component Exceptions" section to Pattern Registry Part 5.

### 10. DEBT-250 Progress Table

Update all child spec statuses to "Completed" with PR links.

### 11. Frontend Debt Cross-Doc Alignment

Keep `docs/frontend/standards.md` Section 17 and `docs/debt/index.md` Frontend Debt in sync for unresolved follow-ups (currently `FE-055` `aria-controls` wiring).

---

## Verification

```bash
# Decision set still complete in parent spec
rg -n '^### Decision [0-9]+:' docs/debt/debt-250-frontend-visual-divergence-compliance-plan.md | wc -l
# Expected: 13

# Child spec matrix still complete in parent progress table
rg -n '\\[DEBT-25[1-9]\\]|\\[DEBT-26[0-4]\\]' \
  docs/debt/debt-250-frontend-visual-divergence-compliance-plan.md | wc -l
# Expected: 14 child specs referenced

# Pattern Registry still contains canonical mobile nav pattern ID
rg -n '^### L-6: Mobile Menu Link' docs/frontend/pattern-registry.md
# Expected: 1 match

# Debt index includes DEBT-250 through DEBT-264 entries
rg -n '\\[DEBT-26[0-4]\\]|\\[DEBT-25[0-9]\\]' docs/debt/index.md
# Expected: rows present for DEBT-250..DEBT-264

# FE-055 follow-up alignment between standards and debt index
rg -n 'FE-055.*aria-controls' docs/frontend/standards.md docs/debt/index.md
# Expected: both docs describe FE-055 follow-up as still active until aria-controls wiring is implemented

# BS-035 decision log has recent sync entries (manual spot-check)
rg -n '^\\| 2026-02-28 \\|' docs/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md
# Expected: >=1 entries for latest integration updates
```
