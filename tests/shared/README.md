# tests/shared

Cross-suite test infrastructure utilities.

Scope:
- Environment/process helpers (`process-env`, dotenv loading)
- Fixture-loading helpers (`load-json-fixture`)
- Helpers that are suite-agnostic and can be used by unit, browser, integration, or E2E tests

Rules:
- Do not import from `tests/e2e/helpers/*`.
- Keep modules free of Playwright-specific dependencies.
