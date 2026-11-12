# KnowledgeCity QuoteHub

Internal tool for KnowledgeCity staff: a proposal generator (Standard, Holistic and Manual
`.pptx` decks built from the official templates) and the KC Pricing Calculator. Node.js +
Express, no database — admin settings are a JSON file on disk.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm test
```

Locally (not production) the admin password is `welcome123`.

## Production

Requires Node.js 18+ (the Docker image uses Node 20). The app **refuses to start** when
`NODE_ENV=production` unless the settings below are valid, and prints what is missing.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Set to `production`. |
| `SESSION_SECRET` | yes | 32+ random characters; signs admin session cookies. |
| `ADMIN_PASSWORD` | yes | 8+ characters; the admin panel password. There is no default in production. |
| `DATA_DIR` | yes | A **persistent, writable** folder. Admin pricing edits and a changed admin password are saved here; they are lost on redeploy if this is not a persistent volume. |
| `PORT` | no | Defaults to `3000`. |

A password changed from the admin panel (saved in `DATA_DIR`) takes priority over `ADMIN_PASSWORD`.

### Docker

```bash
docker build -t quotehub .
docker run -d --name quotehub -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD="choose-a-strong-password" \
  -v quotehub-data:/data \
  quotehub
```

- Health check: `GET /healthz` returns `{"status":"ok"}`.
- Run behind an HTTPS reverse proxy / load balancer. In production the app trusts one proxy
  hop (`X-Forwarded-*`) and marks the session cookie `Secure` for HTTPS requests.
- Run a single instance: admin sessions are kept in memory (admins log in again after a
  restart), and the saved settings file is not shared between instances.

### Access

Only the admin pages need a login. The calculator and proposal pages are open to anyone who
can reach the URL, so keep the deployment on the internal network or behind company sign-in.
Wrong admin passwords are limited to 10 attempts per address per 15 minutes.

## Layout

- `server.js` — routes, sessions, start-up checks
- `src/pricing.js`, `src/products.js`, `src/calculator.js` — pricing engines
- `src/pptx-fill.js` — fills the `.pptx` templates in `templates/`
- `src/config-store.js`, `src/auth.js` — persisted settings and admin login
- `public/` — pages, preview renderer, styles
- `test/` — `npm test`
