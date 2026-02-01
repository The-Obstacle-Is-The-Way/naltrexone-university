# DEBT-045: CLAUDE.md Documentation Drift

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

`CLAUDE.md` has multiple sections that no longer reflect the current state of the codebase.

### Issue 1: Missing ADR-013 Reference

**Location:** Line 152

**Current:**
```
See `docs/adr/` for all Architecture Decision Records (ADR-001 through ADR-012).
```

**Should be:**
```
See `docs/adr/` for all Architecture Decision Records (ADR-001 through ADR-013).
```

ADR-013 (Repository Organization) was added 2026-02-01 but CLAUDE.md wasn't updated.

### Issue 2: Outdated "Current State" Section

**Location:** Lines 125-127

**Current:**
```
Implemented so far:
- `src/domain/entities/**` + tests (SPEC-001)
- `src/domain/value-objects/**` + tests (SPEC-002)
```

**Should reflect:**
- SPEC-001 (Domain Entities) - Implemented
- SPEC-002 (Value Objects) - Implemented
- SPEC-003 (Domain Services) - Implemented
- SPEC-004 (Application Ports) - Implemented
- SPEC-005 (Core Use Cases) - Partial
- SPEC-006 (Drizzle Schema) - Implemented
- SPEC-007 (Repository Implementations) - Implemented
- SPEC-008 (Auth Gateway) - Implemented
- SPEC-009 (Payment Gateway) - Implemented
- SPEC-010 through SPEC-012 - Partial

### Issue 3: Spec Range in Documentation Section

**Location:** Lines 314-316

**Current:**
```
- `docs/specs/spec-001 to spec-010` - Clean Architecture layer specs
- `docs/specs/spec-011 to spec-015` - Feature slice specs
```

**Should be:**
```
- `docs/specs/spec-001 to spec-010` - Clean Architecture layer specs
- `docs/specs/spec-011 to spec-017` - Feature slice specs
```

SPEC-016 (Observability) and SPEC-017 (Rate Limiting) exist but aren't mentioned.

## Impact

- **Onboarding confusion:** New developers get incomplete/wrong picture
- **Out-of-sync documentation:** CLAUDE.md is primary entry point for AI agents
- **Underestimated maturity:** System appears less complete than it is

## Resolution

1. Update ADR reference to "ADR-001 through ADR-013"
2. Rewrite "Current State" section to reflect actual implementation status
3. Update spec ranges in Documentation section

## Verification

- [ ] ADR count matches actual ADR files
- [ ] "Current State" lists all implemented specs
- [ ] Spec ranges cover SPEC-001 through SPEC-017

## Related

- `docs/adr/index.md` - ADR registry
- `docs/specs/index.md` - Spec registry
