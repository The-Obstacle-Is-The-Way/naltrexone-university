# DEBT-014: lib/ Layer Throws Plain Error Instead of ApplicationError

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

## Summary

The `lib/` utilities throw plain `Error` objects with string messages, while the application layer uses structured `ApplicationError` with typed codes. This creates inconsistent error handling.

## Locations

### Runtime Errors (user-facing)
- **`lib/auth.ts:13`**: `throw new Error('UNAUTHENTICATED')`
- **`lib/auth.ts:67`**: `throw new Error('Failed to ensure user row')`
- **`lib/auth.ts:95`**: `throw new Error('User has no email address')`
- **`lib/subscription.ts:37`**: `throw new Error('UNSUBSCRIBED')`

### Startup/Build-time Errors
- **`lib/env.ts:34`**: `throw new Error('Invalid environment variables')`
- **`lib/env.ts:41`**: `throw new Error('NEXT_PUBLIC_SKIP_CLERK must not be true...')`
- **`lib/content/parseMdxQuestion.ts:30,33,36,50,64,67`**: Various content parsing errors

## Why This Is a Problem

1. **Architectural Inconsistency**: Application layer expects `ApplicationError` with structured codes, lib/ throws raw strings
2. **Error Boundary Incompatibility**: `isApplicationError(error)` type guard won't catch lib/ errors
3. **Poor Error Categorization**: Raw `Error` can't be programmatically categorized (is it auth? validation? internal?)
4. **Mixed Patterns**: Some lib/ code throws strings, some throws messages - no consistent contract

## Current Pattern

```typescript
// lib/auth.ts - throws string codes
throw new Error('UNAUTHENTICATED');

// src/application/errors - uses structured error
throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
```

## Impact

- Server actions catching `ApplicationError` miss lib/ errors
- Error logging lacks structured codes for lib/ errors
- Inconsistent error response formats to clients

## Options

### Option A: Use ApplicationError in lib/
Import and throw `ApplicationError` from lib/ utilities.

### Option B: Create lib/errors.ts
Define `LibraryError` or reuse `ApplicationError` with documentation.

### Option C: Document as Expected
Accept that lib/ is "outside" Clean Architecture boundaries and document the contract.

## Acceptance Criteria

- All error-throwing code follows consistent pattern
- Error handlers can identify error type/code uniformly
- Decision documented in ADR or spec
