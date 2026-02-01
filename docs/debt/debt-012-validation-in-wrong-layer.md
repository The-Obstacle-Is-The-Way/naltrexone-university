# DEBT-012: Validation Logic in Adapter Layer Instead of Application Layer

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

Multiple validation concerns are implemented in the adapter layer (repositories) instead of the application layer (use cases or ports). This creates coupling and makes validation rules harder to test and reuse.

## Locations

### 1. Practice Session Params Validation
- **File:** `src/adapters/repositories/drizzle-practice-session-repository.ts` lines 13-20
- **Issue:** Zod schema for session params lives in repository

```typescript
const practiceSessionParamsSchema = z.object({
  count: z.number().int().min(1).max(200),
  questionIds: z.array(z.string().uuid()).max(200),
  tagSlugs: z.array(z.string().min(1)).max(50),
  difficulties: z.array(questionDifficultySchema).max(3),
}).strict();
```

### 2. Choice Label Validation
- **File:** `src/adapters/repositories/drizzle-question-repository.ts` lines 115-121
- **Issue:** Domain value object validation called from adapter

```typescript
if (!isValidChoiceLabel(c.label)) {
  throw new ApplicationError(
    'INTERNAL_ERROR',
    `Invalid choice label "${c.label}" for choice ${c.id}`,
  );
}
```

### 3. SelectedChoiceId Null Validation
- **File:** `src/adapters/repositories/drizzle-attempt-repository.ts` lines 36-44
- **Issue:** Business rule (no null choices) enforced in repository

## Impact

- Adapters tightly coupled to domain validation rules
- Validation logic not reusable by other implementations
- Fakes don't have same validation (LSP violation)
- Changes to validation require adapter updates

## Clean Architecture Principle

> Adapters should translate between external formats and domain formats, not enforce business rules.

## Fix

Move validation to application layer:

1. **Extract validation schemas to `src/application/validation/`**
2. **Validate in use cases before calling repositories**
3. **Repositories trust validated data**

```typescript
// src/application/validation/practice-session-params.ts
export const practiceSessionParamsSchema = z.object({...});

// src/application/use-cases/create-practice-session.ts
const params = practiceSessionParamsSchema.parse(input.params); // Validate here
await this.sessionRepo.create({ userId, mode, paramsJson: params }); // Trust input
```

## Acceptance Criteria

- Validation schemas live in application layer
- Use cases validate input before calling repositories
- Repositories don't throw validation errors
- Fakes and real repos behave identically
