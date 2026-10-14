# Architecture

How the system is built, and why. The code is the source of truth for types and schemas; these documents explain the shape the code takes and the reasons behind it. Decisions themselves are in [the ADRs](../adr/README.md).

- [Practice engine](./practice-engine.md): the Clean Architecture layers, the use cases, and the practice frontend layer.
- [Question rendering](./question-rendering.md): how questions render, navigate and keep state in every viewing context.
- [Content pipeline](./content-pipeline.md): authored questions, through import, seeding and releases, to the rendered page.
- [Tag taxonomy](./tag-taxonomy.md): how topic, substance, treatment and diagnosis tags flow from drafts to filters.
- [Security](./security.md): authentication, authorization, rate limits, idempotency and data isolation.
- [Environments](./environments.md): local, Preview and Production, their variables, and the CI secret standard.
- [Observability](./observability.md): logging, Sentry, the operational alerts and their runbooks.
- [Integrations](./integrations/README.md): Clerk, Stripe and Postgres.
