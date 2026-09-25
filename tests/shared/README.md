# tests/shared

Cross-suite test infrastructure utilities.

Scope:
- Environment/process helpers (`process-env`, dotenv loading)
- Fixture-loading helpers (`load-json-fixture`)
- The `drizzle.mock` transaction boundary for repository error-translation unit tests (`drizzle-mock-transaction`)
- Clerk webhook event builders that default from the recorded `tests/fixtures/clerk` payloads (`clerk-events`)
- A real Next `NextRequest`/`NextFetchEvent` pair for invoking the proxy (`next-proxy-invocation`)
- Helpers that are suite-agnostic and can be used by unit, browser, integration, or E2E tests

Rules:
- Do not import from `tests/e2e/helpers/*`.
- Keep modules free of Playwright-specific dependencies.
