# Premium Landing Page Template (v0)

This folder is a **standalone template app** imported from a v0 community template.

It is intentionally **not wired into** the main Next.js app yet:

- Excluded from the root TypeScript project (`tsconfig.json`) to avoid typechecking conflicts.
- Excluded from Tailwind content scanning (`tailwind.config.js`) to avoid shipping unused CSS.

When we’re ready to integrate this into the product, follow:

- `docs/specs/spec-018-ui-integration.md` — integration + migration plan

Do **not** import files from this folder into `app/` directly until the integration spec is implemented (imports and UI primitives in this template do not match the main app).
