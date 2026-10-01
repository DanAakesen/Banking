---
applyTo: "**/*.ts,**/*.js,**/*.mjs,**/*.cs,**/*.py,**/*.go,**/*.rs"
---

# Backend and data

Banking's confirmed target is one deployed production API for both local and Azure frontends. Read `docs/shared-production-backend-plan.md`. Do not add local business-service/data fallbacks or direct production SQL access to the frontend development launcher. Production owns advisor execution, provider credentials and scheduled jobs; schema changes require a controlled release. Keep Dan/private data separate from shared fictional Demo records. Disposable backend test databases are permitted, separate from the app runtime. Azure shared-backend release was verified on 27 September 2026; use the frontend-only launcher (active shared host: localhost:5444).

Keep request, domain, and persistence contracts clear. Validate external input, return meaningful protocol status, and avoid exposing persistence internals or private details.

Bound potentially large reads and external calls. Design retries around provider limits and idempotency. Use queues and circuit breakers where they solve a concrete problem.

Choose indexes from query patterns and measured plans. Use the database client's supported connection lifecycle and pooling behavior. Choose deletion and retention from product and privacy requirements.

Use transactions and concurrency controls where needed. Keep migrations reproducible and preserve compatibility. Store exact monetary values with currency and explicit date/time semantics when handling money.

Log useful sanitized operation context. Add operational signals for important failure modes without requiring an enterprise monitoring stack for a small service.
