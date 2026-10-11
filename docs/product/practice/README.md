# Practice

What practice does for a learner: tutor and exam sessions, Quick Practice, review and retries. How it is built is in [the practice engine's architecture](../../architecture/practice-engine.md) and [question rendering](../../architecture/question-rendering.md).

## The Contracts

These documents state the invariants practice keeps. Where another document disagrees, they win until one of them is changed.

| Contract | Document | Applies to |
|---|---|---|
| An active exam never reveals correctness or explanations before it ends | [Exam answer secrecy](./exam-answer-secrecy.md) | Use cases, repositories, controllers, rendering, tests |
| Question and choice order is deterministic | [Question ordering](./question-ordering.md) | Session start, Quick Practice, review routes, rendering |
| What each button does, what persists, and what locks, in each mode | [Interaction contracts](./interaction-contracts.md) | The practice view's action bar, question-flow actions, session hooks, post-session navigation |
| Tutor, exam and Quick Practice behaviour | [Modes](./modes.md) | Session lifecycle and navigation |
| Retrying a question after its session | [Retries](./retries.md) | Review routes and attempt writes |

## Routes and Behaviour

- **Sessions run at `/app/practice/[sessionId]`.** Quick Practice runs at `/app/practice/quick`, which Next.js routes before the dynamic segment, and keeps no session.
- **History is at `/app/history`,** with a Sessions tab and a Questions tab. The nav item is "History". The Questions tab is a filterable log of attempted questions: result and source filter on the server, difficulty and tag in the browser.
- **Review links return to where they came from.** The session summary's review links carry `from=summary`, and History's session drill-down carries `from=history`.
- **Retry belongs to the question page.** An ended session's question is retried at `/app/questions/[slug]?mode=review&sessionId=…`, while an active session stays in its runner.
- **A retry never changes the session.** It is a standalone attempt, with no session ID, so a session's score and question states never change after it ends.
- **The "retried" marker lasts one visit.** A session review shows it only during the visit in which the retry happened.
