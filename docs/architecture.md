# Architecture

## Shape

```
Browser (React Server Components + a few client components)
   │  server actions / fetch
   ▼
Next.js route handlers  ──►  src/lib/services/cases.ts  ──►  Prisma  ──►  PostgreSQL
   (src/app/api/**)            (the only place writes happen)
```

One deployable service. The UI, the JSON API, and the business logic live in one repo so a two-person team has one build, one test command, and one deploy.

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| Pages | `src/app/page.tsx`, `src/app/cases/[caseId]/page.tsx`, `src/app/audit/page.tsx` | Server components. Fetch through the service layer; never touch Prisma directly. |
| Client components | `src/app/QueueFilters.tsx`, `src/app/cases/[caseId]/DecisionPanel.tsx`, `src/app/login/LoginForm.tsx` | Interaction only. Their checks are UX, never authorization. |
| Server actions | `src/app/cases/[caseId]/actions.ts`, `src/app/login/actions.ts` | Thin adapters: parse the form, call a service, revalidate paths. |
| JSON API | `src/app/api/cases/route.ts`, `src/app/api/cases/[caseId]/decision/route.ts`, `src/app/api/audit/route.ts` | Same services, for scripts and integration tests. |
| Services | `src/lib/services/cases.ts` | Authorization, validation, transitions, transactions, audit writes. **The only place that mutates data.** |
| Validation | `src/lib/validation.ts` | Zod schemas shared by client and server. |
| Auth | `src/lib/auth.ts`, `src/lib/auth.config.ts`, `src/middleware.ts` | Session issuing and the coarse route gate. |
| Data | `prisma/schema.prisma`, `prisma/migrations/**` | Schema and migrations. |

The rule that keeps this maintainable: **every mutation goes through `src/lib/services/cases.ts`.** If a new endpoint writes to Prisma directly, it has bypassed authorization, validation, and the audit trail at once.

## Data model

- `User` — analyst or admin, bcrypt password hash.
- `Case` — the customer record and its current `status`. All customer PII lives here and nowhere else.
- `RiskFlag` — screening hits attached to a case.
- `Decision` — the analyst-visible history of decisions, with reason text.
- `AuditEvent` — append-only log: actor, action, old status, new status, reason, timestamp. No PII.

`Decision` and `AuditEvent` overlap deliberately: `Decision` is product data an engineer may reshape later; `AuditEvent` is the compliance record and is immutable.

Indexes: `cases(status, submittedAt)` and `cases(riskLevel)` back the queue's default sorts and filters; `audit_events(caseId, createdAt)` and `audit_events(createdAt)` back the audit views.

## Decision flow

1. `DecisionPanel` posts the action and reason to the `submitDecision` server action.
2. `decideCase` re-derives the actor from the server session (`requireActor`), checks the role, and parses the input with `decisionInputSchema`.
3. In a single transaction: update `cases.status`, insert a `Decision`, insert an `AuditEvent`. Either all three land or none do.
4. The status precondition (`PENDING` or `MORE_INFO_REQUESTED`) is checked inside the transaction, so two analysts racing on one case produce one decision and one `409`.

## How to make common changes

**Add a field to a case**
1. Add it to `model Case` in `prisma/schema.prisma`.
2. `npm run db:migrate:dev -- --name add_<field>`.
3. Add it to the `select` in `listCases` (queue) or render it in `src/app/cases/[caseId]/page.tsx`.
4. If it is PII, confirm it is never passed into an `AuditEvent` — `tests/audit-immutability.test.ts` guards this.

**Add a case status**
1. Extend `enum CaseStatus` and migrate.
2. Update `ACTION_TO_STATUS`, `ACTION_TO_AUDIT`, and `ACTIONABLE_STATUSES` in `src/lib/services/cases.ts`.
3. Add it to `DECISION_ACTIONS` in `src/lib/validation.ts` and to `STATUS_STYLES` in `src/components/ui.tsx`.
4. Add a transition test in `tests/decisions.test.ts`.

**Add a page**
Create the route under `src/app/`, call a service function at the top for its data, and let it throw — `requireActor` produces the 401 and middleware handles the redirect.

**Change SLA thresholds**
`AGING_WARNING_DAYS` and `AGING_CRITICAL_DAYS` in `src/lib/services/cases.ts`.

## Performance notes

- All list queries are indexed and capped (`take: 200` for cases, `250` for audit events). Past a few hundred open cases, add keyset pagination to `listCases` rather than raising the cap.
- Pages are `force-dynamic` because every view is per-session; there is no shared cache to invalidate.
- Prisma runs a single pooled client (`src/lib/db.ts`); in serverless deployments put PgBouncer in front of Postgres.

## When to split this into two services

If a non-JavaScript team takes over the backend, or the API gains consumers beyond this UI, `src/lib/services/` is the seam: lift it into a standalone API and leave the Next.js app as a client. Nothing above the service layer contains business rules.
