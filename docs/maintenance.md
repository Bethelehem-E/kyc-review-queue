# Maintenance

Day-2 operations for the one or two engineers who own this app.

## Routine

| Task | Command |
|---|---|
| Install after pulling | `npm install` (runs `prisma generate`) |
| Apply pending migrations | `npm run db:migrate` |
| Create a migration | `npm run db:migrate:dev -- --name <change>` |
| Re-seed demo data (non-production only) | `npm run db:seed` |
| Full check before a PR | `npm run lint && npm run typecheck && npm test && npm run build` |

## Migrations

Migrations are SQL files under `prisma/migrations/`, applied in order by `prisma migrate deploy`. Never edit an applied migration — add a new one.

The audit immutability triggers live in `20260922000500_audit_immutability/migration.sql`. Prisma does not manage triggers, so if you ever reset the database outside of `prisma migrate`, re-apply that file by hand.

Deploy order: run migrations, then release the new app version. Keep migrations backwards compatible for one release (add columns nullable first, backfill, then tighten) so a rollback does not break the running app.

## Backups

The audit trail is the compliance artefact, so backups matter more than the app.

- Take nightly `pg_dump` snapshots plus continuous WAL archiving (or your provider's point-in-time recovery).
- Restore drill quarterly; verify `SELECT count(*) FROM audit_events` matches the source.
- Set a retention policy for `audit_events` with your compliance team. The table only grows; deletion is blocked by trigger, so purging old rows is a deliberate, privileged operation.

## Users

The prototype seeds users. To add one against a real database:

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" 'their-password'
```

then insert a `users` row with that hash and role `ANALYST` or `ADMIN`. Once you move to your IdP (see `docs/security.md`), user management moves there and this table becomes a role mapping only.

## Secrets

`AUTH_SECRET` and `DATABASE_URL` come from the environment. Rotate `AUTH_SECRET` from your secret manager; rotating it invalidates all sessions, so do it outside working hours. Nothing is committed to the repo — `.env*` is gitignored.

## Monitoring

Watch, at minimum:

- 5xx rate on `/api/cases/*` and server-action failures
- Postgres connection saturation (single Prisma pool; add PgBouncer for serverless)
- Queue depth and age: `SELECT count(*) FROM cases WHERE status IN ('PENDING','MORE_INFO_REQUESTED') AND "submittedAt" < now() - interval '7 days'` — the same SLA signal the UI shows

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `DATABASE_URL must be set` in tests | `.env` missing; copy from `.env.example` and start Postgres |
| `audit_events is append-only` | Something tried to update or delete an audit row. This is the guard working — find the caller, don't disable the trigger |
| Login always fails after a deploy | `AUTH_SECRET` changed or differs across instances; all instances must share one value |
| Tests fail with connection refused | `docker compose up -d db` |
| `409` when deciding a case | The case already reached a final status, usually another analyst got there first. Reload the case |
