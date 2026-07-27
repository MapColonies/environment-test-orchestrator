## Goal

Remove the external database (Supabase) from the app, persist all execution reports to a file-based store on a mounted volume, drive all runtime config (admin credentials, agents, per-agent CORS targets) from environment variables, and ship a Helm chart to deploy the app on OpenShift with a PVC for reports.

## 1. Runtime configuration (env vars only)

New env vars read by the server:

- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — login credentials (no hardcoding, no shared Supabase user).
- `SESSION_SECRET` — signs the session cookie (Helm auto-generates one if unset).
- `AGENT_ENVIRONMENTS` — JSON array. Each entry now also carries its own CORS targets:
  ```json
  [
    {
      "id": "qa",
      "name": "QA",
      "base_url": "https://agent-qa.example.com",
      "api_key": "optional",
      "cors_targets": [
        { "name": "Raster geoserver", "url": "https://..." }
      ]
    }
  ]
  ```
  Backwards compatible: if `cors_targets` is omitted, the server falls back to `/cors-test` on the agent (current behavior).
- `REPORTS_DIR` — filesystem path where reports are written (default `/data/reports`, mounted from the PVC).
- `DEMO_MODE` — unchanged; when no `AGENT_ENVIRONMENTS` is set the app runs demo mode as today.

## 2. Replace Supabase with file storage + cookie auth

- Delete Supabase usage from the runtime path. New `src/lib/reports-store.server.ts` reads/writes JSON files under `REPORTS_DIR` (one file per execution, plus an in-memory index rebuilt on boot). Atomic writes via `fs.rename` from a temp file.
- New `src/lib/auth.server.ts` + `src/lib/session.ts`: HMAC-signed cookie (`sid`) containing `{ user, exp }`. `requireAuth` middleware replaces `requireSupabaseAuth`. Login server route validates against `ADMIN_USERNAME`/`ADMIN_PASSWORD` using constant-time compare.
- `src/routes/auth.tsx` posts to `/api/login`; logout hits `/api/logout`. `_authenticated/route.tsx` checks the cookie.
- `agent.functions.ts` rewritten to use the new middleware and store. `startExecution` / `pollExecution` / `listExecutions` / `getExecution` operate on the file store; the streaming/demo behavior stays identical.
- Remove `seedDemoExecutions` DB write path; in demo mode the store seeds itself on first boot if empty.
- Leave the auto-generated `src/integrations/supabase/*` files in place (they're auto-managed) but stop importing them from app code. `start.ts` drops the Supabase auth attacher.

## 3. CORS tab

`getCorsTargets` returns `env.cors_targets` when configured, otherwise falls back to `/cors-test` (unchanged agent behavior). Demo envs keep the current sample list. The browser-side probe UI is unchanged.

## 4. Helm chart (`deploy/helm/sanity-agent-runner/`)

Files:

- `Chart.yaml`
- `values.yaml` — image, service, route (OpenShift), resources, `persistence` (size, storageClass, accessMode), `auth.username`/`auth.password`, `agents` (list rendered to `AGENT_ENVIRONMENTS`), `demoMode`, `sessionSecret` (blank ⇒ auto-generated).
- `templates/_helpers.tpl`
- `templates/deployment.yaml` — mounts PVC at `/data`, injects env vars from a `Secret` (credentials, session secret) and `ConfigMap` (agents JSON, `REPORTS_DIR`, `DEMO_MODE`). Runs as non-root, `readOnlyRootFilesystem: true`, with `/tmp` and `/data` writable — OpenShift-friendly (no fixed UID).
- `templates/service.yaml`
- `templates/route.yaml` — OpenShift `Route` with edge TLS, gated by `.Values.route.enabled`.
- `templates/pvc.yaml` — `ReadWriteOnce` by default.
- `templates/configmap.yaml`, `templates/secret.yaml` — secret uses `lookup` to keep an existing `sessionSecret` across upgrades and generates one with `randAlphaNum` on first install.
- `templates/NOTES.txt`
- `.helmignore`

Container listens on port 8080 (matches the existing Vite/Nitro build) and health-probes `GET /`.

## 5. Dockerfile

Add a root-level `Dockerfile` (multi-stage: `oven/bun` build → distroless-node runtime) that builds the Nitro output and starts it with `node .output/server/index.mjs`. Exposes 8080, declares `VOLUME /data`.

## 6. Docs

Short `deploy/README.md` covering: build & push the image, `helm install`, sample `values.yaml` with two agents and their CORS target lists, how the PVC preserves reports across restarts, and how to rotate the admin password.

## Technical notes

- File store layout: `/data/reports/index.json` (id → summary) + `/data/reports/<id>.json` (full record with logs/results). Writes take a per-process mutex to avoid races on concurrent polls.
- Cookie: `HttpOnly; SameSite=Lax; Secure` when `X-Forwarded-Proto: https`. 12h expiry, sliding on activity.
- No DB migrations, no Supabase env vars required at runtime. The `.env` for local dev gets `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=admin`, `REPORTS_DIR=./.data/reports`, `SESSION_SECRET=dev-secret`.
- Server runtime constraint: file I/O uses `node:fs/promises`; the Cloudflare-Worker target used by the current template does not support arbitrary filesystem writes, so the Helm image runs the Nitro **node-server** preset instead. `vite.config.ts` gets `nitro: { preset: "node-server" }`.
