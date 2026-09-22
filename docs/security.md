# Security model

## Authentication

- Every page and every API route requires a session. `src/middleware.ts` matches all paths except `/api/auth/*` and static assets, and redirects anonymous users to `/login`.
- Sessions are httpOnly, SameSite=Lax, signed JWT cookies with an 8-hour lifetime (`src/lib/auth.config.ts`); Secure is set automatically over HTTPS.
- Passwords are bcrypt hashes (cost 12). Login always performs a hash comparison even when the account does not exist, so response timing does not reveal account existence, and the error message is a generic "Invalid email or password."

## Authorization, checked in three places

1. **Middleware** (`src/middleware.ts`) — coarse route gate. Cheap, and the reason anonymous users see a redirect instead of a broken page.
2. **Service layer** (`src/lib/services/cases.ts`) — the authoritative boundary. `requireActor()` re-derives the actor from the server session on every read and write; `assertCanDecide()` checks the role before any mutation. Middleware is never trusted here, because middleware can be bypassed by any code path that does not go through it.
3. **UI** (`DecisionPanel`) — hides or disables actions the user cannot take. This is UX only. `tests/authorization.test.ts` asserts that calling the API directly, with the UI bypassed entirely, still fails.

## Audit log integrity

- `audit_events` is append-only. There is no update or delete code path in the application, and `prisma/migrations/20260922000500_audit_immutability/migration.sql` installs `BEFORE UPDATE`, `BEFORE DELETE`, and `BEFORE TRUNCATE` triggers that raise an exception. `tests/audit-immutability.test.ts` proves the database itself refuses the writes.
- Audit rows are written inside the same transaction as the status change, so a decision cannot be recorded without its audit entry.
- **Production hardening step, not done here:** run the application as a Postgres role with `INSERT, SELECT` on `audit_events` but no `UPDATE`, `DELETE`, or `TRUNCATE`, and run migrations as a separate owner role. Triggers alone are bypassable by a superuser (`ALTER TABLE ... DISABLE TRIGGER`), which is exactly what the seed script does to reset demo data.

```sql
-- production: app connects as kyc_app, migrations run as the table owner
CREATE ROLE kyc_app LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON cases, decisions, risk_flags, users TO kyc_app;
GRANT SELECT, INSERT ON audit_events TO kyc_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM kyc_app;
```

## Sensitive data handling

- Customer PII (name, email, date of birth, government ID) lives only on the `cases` table. `AuditEvent` stores actor, action, statuses, reason, and timestamp — never customer identifiers. A test serialises an audit row and asserts none of the case's PII appears in it, and pins the exact column set so a future field cannot be added silently.
- Government IDs are stored as last-4 only; this prototype never holds a full document number.
- Application logs are restricted to errors in production (`src/lib/db.ts`); Prisma query logging, which would echo parameters, is disabled outside development.
- API errors are mapped by `src/lib/http.ts` to typed status codes; unexpected errors are logged server-side and returned as a generic 500, so no stack trace or query text reaches the client.
- No secrets in source: everything comes from environment variables, `.env*` is gitignored, and `.env.example` contains placeholders only.

## Input validation

- One Zod schema (`src/lib/validation.ts`) is used by both the client form and the server; the server never trusts the client's copy.
- Reason text uses a character allow-list (letters in any script, digits, whitespace, and basic punctuation), 10–1000 characters after trimming. Control characters, null bytes, angle brackets, and backslashes are rejected outright rather than sanitised. Rejecting is safer than escaping: there is no encoder to get wrong later.
- React escapes all rendered text by default, and the app never uses `dangerouslySetInnerHTML`.
- All database access goes through Prisma's parameterised queries. The one raw-SQL path in tests uses bound parameters.

## Transport and browser hardening

`next.config.ts` sets, on every response: `Content-Security-Policy` (no third-party origins, `frame-ancestors 'none'`, `form-action 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` disabling camera/microphone/geolocation, and HSTS. `poweredByHeader` is off.

CSRF: server actions are protected by Next.js's origin check, and the Auth.js endpoints carry their own CSRF token. The JSON API relies on SameSite=Lax cookies; if you expose it to other origins, add an explicit CSRF token or a bearer-token scheme.

## Before production

1. Replace the credentials provider in `src/lib/auth.ts` with your IdP (Okta / Entra / Google) — the rest of the auth stack is unchanged, since roles come from the JWT callback. Delete the seeded users.
2. Apply the restricted database role above and run migrations as a separate owner.
3. Add rate limiting to `/api/auth/*` and the decision endpoint (not implemented in this prototype).
4. Ship application and audit logs to a retention-controlled store, and set a retention policy for `audit_events`.
5. Encrypt PII at rest (column-level or disk-level), enforce TLS to Postgres (`sslmode=require`), and rotate `AUTH_SECRET` on a schedule.
6. Add `LOGIN_SUCCEEDED` / `LOGIN_FAILED` audit writes — the enum exists but the prototype only audits case decisions.

## Known gaps in this prototype

- No rate limiting, no account lockout, no MFA.
- No field-level encryption of PII.
- Case reads are not audited, only decisions.
- Any authenticated analyst can view any case; there is no per-case assignment or need-to-know restriction.
- An analyst can still paste PII into a free-text reason. Validation constrains the character set but cannot detect intent; consider a redaction pass or a reason-code dropdown if that matters to your compliance team.
