# Sanity Agent Runner — OpenShift deployment

This directory ships everything needed to run the app on OpenShift:

- `../Dockerfile` — multi-stage image built with Bun (Nitro `node-server`
  preset) and run on `node:20-alpine`. Listens on port `8080`, writes
  reports to `/data/reports`.
- `helm/sanity-agent-runner/` — Helm chart with a `Deployment`, `Service`,
  `Route` (OpenShift), `ConfigMap`, `Secret`, and `PersistentVolumeClaim`.

## Build & push the image

```sh
docker build -t <registry>/sanity-agent-runner:<tag> .
docker push <registry>/sanity-agent-runner:<tag>
```

## Install the chart

```sh
helm upgrade --install sanity-agent-runner deploy/helm/sanity-agent-runner \
  --namespace <your-namespace> --create-namespace \
  -f my-values.yaml
```

### Minimal `my-values.yaml`

```yaml
image:
  repository: <registry>/sanity-agent-runner
  tag: "1.0.0"

auth:
  username: sanity-admin
  password: "s0me-strong-password"     # move to a sealed-secret in real use

persistence:
  enabled: true
  size: 5Gi
  storageClass: "gp3"                  # your cluster default is fine too

agents:
  - id: qa
    name: QA
    base_url: https://sanity-agent-qa.apps.example.com
    cors_targets:
      - { name: "Raster geoserver", url: "https://raster-qa.example.com/workspaces" }
      - { name: "Raster pycsw",     url: "https://catalog-qa.example.com/api/raster/v1" }
  - id: prod
    name: Production
    base_url: https://sanity-agent-prod.apps.example.com
    api_key: "optional-per-agent-key"
    cors_targets:
      - { name: "3D pycsw",         url: "https://serving-3d-pycsw.example.com/" }
      - { name: "3D MAPPROXY",      url: "https://tiles.example.com/api/3d/v1/b3dm" }
```

If `agents` is left empty the app boots in **demo mode** and shows mock
data — handy for verifying the deployment before real agents exist.

## Persistence

Every execution is stored as one JSON file under `REPORTS_DIR`
(default `/data/reports`). The chart provisions a `ReadWriteOnce` PVC of
`persistence.size` and mounts it at that path, so reports survive pod
restarts and upgrades. Deployment strategy is `Recreate` because RWO PVCs
can only be attached to a single pod at a time.

To reuse an existing PVC, set `persistence.existingClaim: <name>` and the
chart will mount it without provisioning a new one.

## Rotating the admin password

Edit `auth.password` in your values file and run `helm upgrade`. The Secret
is rewritten and the Deployment rolls automatically (a checksum annotation
tracks the Secret contents).

## Rotating the session secret

`sessionSecret` is auto-generated on first install and preserved across
upgrades. To force everyone to re-login, set a new value explicitly:

```sh
helm upgrade sanity-agent-runner deploy/helm/sanity-agent-runner \
  --set sessionSecret="$(openssl rand -hex 32)" --reuse-values
```

## Env vars the container reads

| Var                  | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `ADMIN_USERNAME`     | Login username                                                 |
| `ADMIN_PASSWORD`     | Login password                                                 |
| `SESSION_SECRET`     | HMAC key for the session cookie                                |
| `REPORTS_DIR`        | Where reports are written (mounted from the PVC)               |
| `AGENT_ENVIRONMENTS` | JSON array of agents; each may include `cors_targets`          |
| `DEMO_MODE`          | Force demo mode even when `AGENT_ENVIRONMENTS` is set          |
| `PORT` / `HOST`      | Nitro server binding — leave the defaults (`8080` / `0.0.0.0`) |
