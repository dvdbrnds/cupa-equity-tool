# CUPA Equity Tool — Admin Guide

For IT administrators and system administrators.

---

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Docker Deployment](#docker-deployment)
3. [Coolify Deployment](#coolify-deployment)
4. [First-Time Setup](#first-time-setup)
5. [Database Management](#database-management)
6. [User Management](#user-management)
7. [Okta / SAML SSO Configuration](#okta--saml-sso-configuration)
8. [Email (SMTP) Configuration](#email-smtp-configuration)
9. [OpenAI API Key](#openai-api-key)
10. [Troubleshooting](#troubleshooting)

---

## Environment Variables

All configuration is via environment variables. Create a `.env` file in `packages/server/` for local development (this file is gitignored).

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3001` |
| `NODE_ENV` | `development` or `production` | `development` |
| `JWT_SECRET` | Secret key for signing JWT tokens — use a long random string in production | `dev-secret-change-in-production` |

### Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_DIR` | Directory where the SQLite database is stored | `./data` |

### CORS / Client

| Variable | Description | Default |
|----------|-------------|---------|
| `CLIENT_URL` | Frontend URL for CORS — must match the browser-visible URL | `http://localhost:5173` |

### Email (optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.office365.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use TLS (`true`) or STARTTLS (`false`) | `false` |
| `SMTP_USER` | SMTP account username | `noreply@moravian.edu` |
| `SMTP_PASS` | SMTP account password | — |
| `SMTP_FROM` | From address shown in emails | `CUPA Equity Tool <noreply@moravian.edu>` |

If `SMTP_HOST` is not set, email notifications are silently skipped (no error).

### AI Matching (optional)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for AI-powered CUPA matching |

If not set, the AI Match tab shows a "not configured" message.

### Okta / SAML SSO (optional)

| Variable | Description |
|----------|-------------|
| `SAML_ENTRY_POINT` | Okta SSO sign-on URL |
| `SAML_ISSUER` | Entity ID / audience URI |
| `SAML_CERT` | IdP signing certificate (PEM, newlines as `\n`) |
| `SAML_CALLBACK_URL` | ACS URL — must be `https://your-domain/api/auth/saml/callback` |
| `SAML_ADMIN_GROUP` | Okta group name to map to `system_admin` role |
| `SAML_HR_GROUP` | Okta group name to map to `hr_admin` role |

### SSL (optional — recommended to let Traefik/Coolify handle TLS)

| Variable | Description |
|----------|-------------|
| `SSL_CERT_PATH` | Path to SSL certificate file |
| `SSL_KEY_PATH` | Path to SSL private key file |
| `SSL_PORT` | HTTPS port | `3443` |

---

## Docker Deployment

### Build

```bash
docker build -t cupa-equity-tool .
```

### Run

```bash
docker run -d \
  --name cupa-equity-tool \
  -p 3001:3001 \
  -v /data/cupa:/app/data \
  -e JWT_SECRET=your-secret-here \
  -e NODE_ENV=production \
  -e CLIENT_URL=https://cupa.moravian.edu \
  cupa-equity-tool
```

### Docker Compose

```bash
docker compose up -d
```

The `docker-compose.yaml` at the repo root mounts `./data` for persistent storage. Override environment variables via a `.env` file in the same directory as `docker-compose.yaml`.

---

## Coolify Deployment

1. In Coolify, create a new **Docker Compose** service pointing to the GitHub repo.
2. Set the **build context** to the repo root.
3. Under **Environment Variables**, add:
   - `JWT_SECRET` — generate with `openssl rand -hex 32`
   - `NODE_ENV=production`
   - `CLIENT_URL` — your public URL (e.g., `https://cupa.moravian.edu`)
   - `OPENAI_API_KEY` — if using AI matching
   - SMTP variables — if using email notifications
   - SAML variables — if using Okta SSO
4. Under **Volumes**, map a persistent directory to `/app/data`.
5. Coolify/Traefik handles SSL termination — the app runs on HTTP internally.

---

## First-Time Setup

On first startup with an empty database, the server auto-seeds two default users:

| Email | Password | Role |
|-------|----------|------|
| `admin@moravian.edu` | `admin123` | System Administrator |
| `hr@moravian.edu` | `hr123` | HR Administrator |

**Change these passwords immediately** after first login via the Users page.

After logging in, follow the dashboard setup checklist:
1. Import the CUPA catalog (from your CUPA subscription).
2. Import employee positions (from your HRIS export).
3. Import compensation data.
4. Import CUPA salary benchmarks.

---

## Database Management

The database is SQLite, stored as a single file at `$DATA_DIR/cupa.db`. It auto-saves every 5 seconds.

### Backup

Copy the `.db` file:

```bash
cp /data/cupa/cupa.db /backup/cupa-$(date +%Y%m%d).db
```

### Reset

From the app: log in as system admin → **Settings** (top-right menu) → **Reset Database**. This wipes all data and re-seeds the default users.

From the command line:

```bash
npm run db:reset -w @cupa/server
```

### Seed VP Roles

If VP divisions need to be pre-populated from HRIS data:

```bash
npm run db:seed-vp-roles -w @cupa/server
```

---

## User Management

Go to **Users** in the navigation (system admin / HR admin only).

- **Create user** — set email, name, role, and division.
- **Edit user** — change role or division, reset password.
- **Deactivate** — prevents login without deleting the user record.
- **Assign VP Role** — links a user to a VP division so they see only that division's data.

### Roles

| Role | Capabilities |
|------|-------------|
| `system_admin` | Full access including user management and database reset |
| `hr_admin` | All HR features + user management |
| `hr_analyst` | All HR features, no user management |
| `vp_reviewer` | Read/write access to their assigned division only |
| `executive` | Read-only access to all divisions |
| `academic_dean` | Read-only access to their assigned division |

---

## Okta / SAML SSO Configuration

### In Okta

1. Create a new SAML 2.0 application.
2. Set the **Single sign-on URL** (ACS URL) to `https://your-domain/api/auth/saml/callback`.
3. Set the **Audience URI** to your chosen issuer string (e.g., `https://cupa.moravian.edu`).
4. Add attribute statements:
   - `email` → `user.email`
   - `firstName` → `user.firstName`
   - `lastName` → `user.lastName`
   - `groups` → `user.groups` (for role mapping)
5. Assign users/groups to the application.
6. Download the IdP metadata and copy the **signing certificate**.

### In the App

Set these environment variables:

```
SAML_ENTRY_POINT=https://your-okta-domain/app/your-app-id/sso/saml
SAML_ISSUER=https://cupa.moravian.edu
SAML_CERT=MIIDpDCC...  (certificate without BEGIN/END lines, newlines as \n)
SAML_CALLBACK_URL=https://cupa.moravian.edu/api/auth/saml/callback
SAML_ADMIN_GROUP=CUPA-Admins
SAML_HR_GROUP=CUPA-HR
```

Users who log in via Okta and are in the admin group get `system_admin` role; HR group gets `hr_admin`. All other Okta users get `vp_reviewer` by default.

Local password accounts still work alongside SSO.

---

## Email (SMTP) Configuration

The app uses SMTP to send:
- VP notification when a review cycle is assigned to them.
- HR notification when a VP flags a position.
- HR notification when a VP submits their review.

### Microsoft 365 / Exchange

```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@moravian.edu
SMTP_PASS=your-app-password
SMTP_FROM=CUPA Equity Tool <noreply@moravian.edu>
```

Use an app password (not the account password) if the account has MFA enabled.

### Testing

Check server logs for `[email]` lines. If `SMTP_HOST` is not set you will see:

```
[email] SMTP_HOST not configured — skipping email: ...
```

---

## OpenAI API Key

The AI CUPA matching feature requires an OpenAI API key with billing credits.

1. Create an account at [platform.openai.com](https://platform.openai.com).
2. Generate an API key under **API keys**.
3. Add billing credits under **Billing**.
4. Set `OPENAI_API_KEY=sk-...` in your environment.

The feature uses `gpt-4o-mini` which costs approximately $0.002 per match query.

---

## Troubleshooting

### App won't start

- Check `DATA_DIR` is writable by the process.
- Check `JWT_SECRET` is set.
- Look at Docker/Coolify logs for the specific error.

### Login fails

- Verify the user account exists and is active.
- If using Okta, check `SAML_*` variables are correct and the callback URL matches exactly.
- If cookies aren't persisting, verify the app is being accessed over HTTPS (or `CLIENT_URL` matches).

### AI Match returns "not configured"

- Verify `OPENAI_API_KEY` is set in environment variables.
- Restart the server after adding the key.

### AI Match returns "quota exceeded"

- Add billing credits at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing).

### Emails not sending

- Check `SMTP_HOST` is set.
- Look for `[email] Failed to send email:` lines in the server logs.
- For Microsoft 365, ensure you're using an app password if MFA is enabled.
- Verify `SMTP_USER` has permission to send as the `SMTP_FROM` address.

### Equity analysis shows no results

- Ensure compensation data has been imported (positions need `current_salary`).
- Ensure CUPA salary benchmarks have been imported for the selected data year.
- Ensure positions have CUPA codes assigned.
- Check the server logs for `[equity]` diagnostic messages.
