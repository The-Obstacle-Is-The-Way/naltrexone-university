# BUG-030: Time Spent Always Zero

## Severity: P1 - High

## Summary
Every answer attempt is recorded with `timeSpentSeconds: 0`. No timer mechanism exists to track how long users spend on each question.

## Location
- `src/application/use-cases/submit-answer.ts:60`
- `app/(app)/app/practice/page.tsx` (no timer implementation)

## Current Behavior
```typescript
// submit-answer.ts:60
const attempt = await this.attempts.insert({
  userId: input.userId,
  questionId: question.id,
  practiceSessionId: session ? session.id : null,
  selectedChoiceId: input.choiceId,
  isCorrect: grade.isCorrect,
  timeSpentSeconds: 0,  // ALWAYS ZERO - hardcoded
});
```

The database column exists (`db/schema.ts:308`), but no code calculates or passes actual time spent.

## Expected Behavior
1. Start timer when question is displayed
2. Stop timer when answer is submitted
3. Send elapsed time to server with submission
4. Store actual `timeSpentSeconds` in attempts table

## Impact
- **No pacing analytics:** Cannot identify questions users struggle with (time-wise)
- **No exam simulation:** Real exams are timed; users can't practice pacing
- **No performance insights:** "Slow but correct" vs "fast but wrong" not distinguishable
- **Feature incomplete:** Database schema supports it, but feature is unwired

## Root Cause
Timer implementation was never built. The field was added to schema anticipating the feature.

## Recommended Fix
**Frontend (practice/page.tsx):**
```typescript
const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);

// When question loads
useEffect(() => {
  if (question) {
    setQuestionStartTime(Date.now());
  }
}, [question?.questionId]);

// On submit
const timeSpentSeconds = questionStartTime
  ? Math.round((Date.now() - questionStartTime) / 1000)
  : 0;

const res = await submitAnswer({
  questionId: question.questionId,
  choiceId: selectedChoiceId,
  timeSpentSeconds,
});
```

**Backend (submit-answer.ts):**
```typescript
// Accept timeSpentSeconds in input
input: {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
  timeSpentSeconds?: number;  // New field
}
```

## Related
- SPEC-011: Practice flow
- BUG-020: Practice sessions never started (related timing feature)
