# DEBT-054: Unused Domain Error Codes — Defined But Never Thrown

**Status:** Open
**Priority:** P3
**Date:** 2026-02-02

---

## Description

Three domain error codes are defined in the type system but never thrown anywhere in production code:

1. `SESSION_ALREADY_ENDED`
2. `INVALID_SESSION`
3. `NO_QUESTIONS_MATCH`

**Location:** `src/domain/errors/domain-errors.ts:1-7`

```typescript
export type DomainErrorCode =
  | 'INVALID_CHOICE'
  | 'SESSION_ALREADY_ENDED'    // ← Never thrown
  | 'INVALID_SESSION'          // ← Never thrown
  | 'NO_QUESTIONS_MATCH'       // ← Never thrown
  | 'SUBSCRIPTION_EXPIRED';
```

## Impact

- Error codes suggest handling for conditions that are never triggered
- Misleading for developers reading error type definitions
- Related to BUG-020: Practice sessions never started (session errors unused)
- If these conditions should be validated, they're not

## Resolution

**Option A: Implement validation** (if conditions should be caught)
1. In `endPracticeSession`: throw `SESSION_ALREADY_ENDED` if session.endedAt exists
2. In session operations: throw `INVALID_SESSION` if session not found
3. In `getNextQuestion`: throw `NO_QUESTIONS_MATCH` if filter returns empty

**Option B: Remove unused codes** (if not needed)
1. Remove the three error codes from type
2. Update any documentation
3. Keep only error codes that are actually thrown

## Verification

If keeping:
- [ ] Each error code is thrown from at least one location
- [ ] Error handling exists for each code

If removing:
- [ ] Error codes removed from type definition
- [ ] No references remain

## Related

- `src/domain/errors/domain-errors.ts:1-7`
- BUG-020: Practice sessions never started/ended
- DEBT-052: Unused computeSessionProgress
