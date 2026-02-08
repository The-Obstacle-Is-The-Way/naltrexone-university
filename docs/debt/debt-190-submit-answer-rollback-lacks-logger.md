# DEBT-190: SubmitAnswerUseCase Rollback Error Handling Lacks Logger

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

`SubmitAnswerUseCase.execute()` has a complex try-catch-try-catch pattern for rollback when `recordQuestionAnswer` fails after an attempt has been inserted. If the rollback itself fails, the error is re-thrown as `ApplicationError('INTERNAL_ERROR', ...)` but no structured logging captures the rollback failure context.

```typescript
// submit-answer.ts:111-146
try {
  await this.sessions.recordQuestionAnswer({...});
} catch (error) {
  try {
    const rolledBack = await this.attempts.deleteById(attempt.id, input.userId);
    if (!rolledBack) {
      throw new ApplicationError('INTERNAL_ERROR', '...');
    }
  } catch (rollbackError) {
    // No logger.error() here — failure context is lost
    if (rollbackError instanceof ApplicationError) throw rollbackError;
    throw new ApplicationError('INTERNAL_ERROR', '...');
  }
  throw error;
}
```

### File

`src/application/use-cases/submit-answer.ts:111-146`

## Impact

- Rollback failures in production are silent — no structured log to diagnose
- The attempt ID and original error are not captured for incident response
- Other use cases (e.g., `GetPracticeSessionReviewUseCase`, `GetMissedQuestionsUseCase`) inject a logger; this one does not

## Resolution

1. Inject `Logger` as a constructor dependency in `SubmitAnswerUseCase`
2. Log rollback failures with attempt ID and error context:
   ```typescript
   } catch (rollbackError) {
     this.logger.error(
       { attemptId: attempt.id, rollbackError },
       'Failed to roll back orphaned attempt after session update failure',
     );
   }
   ```
3. Update `FakeSubmitAnswerUseCase` and composition root accordingly

## Verification

- [ ] Logger injected and used in rollback catch block
- [ ] Rollback failure test verifies log output
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
