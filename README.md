# KYC Review Queue

An internal review tool for KYC analysts: work a queue of pending customer cases, open a case to review its data and risk flags, and drive it to **Approved**, **Rejected**, or **More information requested** — with an append-only audit trail behind every status change.

Built as a replacement pattern for internal apps currently living in Microsoft Power Apps, sized so that one or two engineers can own it.

---

## What it does

| Page | Shows | Path |
|---|---|---|
| Review queue | Case ID, customer name, risk level, submission date, current status, plus aging/SLA alerts. Sort by oldest / newest / risk / status; filter by status, risk level, and free-text search. | `/` |
| Case detail | Customer information, KYC status, risk level, risk flags, submitted date, previous decisions, and the case's audit history. Actions: Approve, Reject, Request more information. | `/cases/[caseId]` |
| Audit history | Analyst name and email, action taken, timestamp, old status, new status, and reasoning. Filterable by case and analyst. Read-only. | `/audit` |

Rules enforced by the server:

- **Reject** and **Request more information** require a reason (10–1000 characters, allow-listed character set). Approve allows an optional note.
- A case can only be actioned while it is `PENDING` or `MORE_INFO_REQUESTED`. Deciding an already-final case returns `409`.
- Cases older than 3 days show an "Aging" badge; older than 7 days a "SLA breached" badge, with a count banner at the top of the queue.

## Stack

- **Next.js 15** (App Router, TypeScript) — UI and API in one deployable service
- **PostgreSQL 16 + Prisma** — schema, migrations, and typed queries
- **Auth.js (NextAuth v5)** credentials provider with bcrypt hashes and an 8-hour JWT session cookie
- **Zod** — one validation schema shared by the client form and the server
- **Vitest** — unit, service, API-route, and database-level tests

## Run it locally

Prerequisites: Node.js 20+ and Docker (or any Postgres 16 you point `DATABASE_URL` at).

```bash
git clone <this repo> && cd kyc-review-queue
cp .env.example .env            # then set AUTH_SECRET: openssl rand -base64 32
docker compose up -d db         # starts Postgres on :5432
npm install
npm run db:migrate              # apply migrations
npm run db:seed                 # 60 synthetic cases + 3 users
npm run dev                     # http://localhost:3000
```

### Seeded logins

All seeded users share the password `AnalystPass123!` (override with `SEED_PASSWORD`).

| Email | Role |
|---|---|
| `analyst@kycdemo.test` | Analyst |
| `rmartin@kycdemo.test` | Analyst |
| `admin@kycdemo.test` | Admin |

These exist **only** for the local prototype. See [`docs/security.md`](docs/security.md) for swapping in a real identity provider.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Signing key for session cookies (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | `true` for local/dev and container deployments |
| `SEED_PASSWORD` | Optional override for seeded user passwords |

No secrets are committed; `.env` is gitignored and `.env.example` holds placeholders only.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Full Vitest suite (requires a running Postgres) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a new migration from schema changes |
| `npm run db:seed` | Reset and re-seed synthetic data |

## Tests

`npm test` runs against a real Postgres so that database-level guarantees are covered, not just application code.

- `tests/decisions.test.ts` — approve / reject / request-more-info transitions, audit event contents, required reasons, and the conflict guard on already-decided cases.
- `tests/authorization.test.ts` — unauthenticated and malformed sessions rejected at the service layer *and* by the API routes (401), role gate on deciding, and the happy path for an authenticated analyst.
- `tests/reason-validation.test.ts` — script tags, HTML injection, null bytes, control characters, template injection, over/under-length reasons rejected with no partial write; SQL-shaped prose stored verbatim rather than executed.
- `tests/audit-immutability.test.ts` — `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_events` refused by the database; audit rows contain no customer PII.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — layer boundaries and how to add a field, status, or page
- [`docs/security.md`](docs/security.md) — security model, threat notes, and what to change before production
- [`docs/maintenance.md`](docs/maintenance.md) — day-2 operations: migrations, backups, users, secrets

## Known limitations of this prototype

- Credentials auth with seeded users, not a real IdP.
- The queue fetches up to 200 rows and is not paginated; fine for a few hundred cases, needs server-side pagination beyond that.
- SLA thresholds (3 and 7 days) are constants in `src/lib/services/cases.ts`, not configurable per team.
- No bulk actions, no case assignment, no notifications, no document upload/viewing.
- Audit entries are immutable by trigger; a database superuser can still disable triggers. See `docs/security.md` for the restricted-role hardening step.
