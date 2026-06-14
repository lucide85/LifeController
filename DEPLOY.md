# Deploying LifeController

Two supported shapes:

- **Option A — behind an existing Traefik** (the `vikane.cloud` setup). LifeController
  runs as one more container on the app-VM; the separate Traefik VM gives it HTTPS.
  **This is the recommended path for `things.vikane.cloud`.**
- **Option B — standalone** with its own built-in Caddy TLS (for a fresh server with
  no reverse proxy). See the end of this doc.

---

# Option A — behind your existing Traefik (vikane.cloud)

```
Internet ─► Traefik VM (websecure / 443, Let's Encrypt)
                 └─http─► app-VM 192.168.1.25 : 3002  ─►  app :3000 ─► Postgres+pgvector
                                                                   └─► uploads (Docker volume)
```

Fixed facts about the environment:

| | |
|---|---|
| App-VM (runs containers) | `192.168.1.25` (Ubuntu Server 24.04, Docker + compose) |
| This site's port | **3002** (3001 is `treningsapp`) → maps to the container's 3000 |
| Traefik | separate VM, file provider, `/etc/traefik/dynamic/`, `watch: true` |
| HTTPS entrypoint / cert resolver | `websecure` / `letsencrypt` |
| Subdomain | `things.vikane.cloud` |

## 1. DNS

Add an **A record** `things.vikane.cloud` → the same public IP as `run.vikane.cloud`.
If you already have a wildcard `*.vikane.cloud`, DNS is done — skip this.

## 2. On the app-VM (192.168.1.25): get the app running

```bash
ssh <user>@192.168.1.25
git clone https://github.com/lucide85/LifeController.git
cd LifeController

# Secrets (gitignored, never leave the VM)
cp .env.example .env
cp settings.example.json settings.json
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "adminSecureCode=$(openssl rand -hex 32)"
nano .env          # see "What to put in .env" below
nano settings.json # paste the adminSecureCode
```

**What to put in `.env`:**
```ini
APP_PORT=3002
POSTGRES_PASSWORD=<generated above>

AUTH_SECRET=<generated above>
AUTH_URL=https://things.vikane.cloud
NEXTAUTH_URL=https://things.vikane.cloud

AUTH_GOOGLE_ID=<google client id>
AUTH_GOOGLE_SECRET=<google client secret>
ADMIN_EMAIL=avikane@gmail.com

ANTHROPIC_API_KEY=<your key>
VOYAGE_API_KEY=<your key, optional>
```
(Leave `DOMAIN` / `ACME_EMAIL` unset — those are only for Option B.)

Bring it up (note the `COMPOSE_FILE` export — it selects the Traefik stack for both
docker compose and the helper scripts):
```bash
export COMPOSE_FILE=compose.vm.yml      # do this once per shell session

docker compose up -d db                 # start the database
bash scripts/migrate.sh                 # create pgvector extension + schema
docker compose up -d --build            # build + start the app (first build: a few min)

curl -I http://localhost:3002           # local smoke test → expect 200/307
docker compose logs -f app              # watch it boot; Ctrl-C when healthy
```

## 3. Google OAuth redirect URI

In Google Cloud Console → your OAuth client → **Authorized redirect URIs**, add exactly:
```
https://things.vikane.cloud/api/auth/callback/google
```

## 4. Let the Traefik VM reach the port

On the **app-VM**, allow only the Traefik VM to hit 3002:
```bash
sudo ufw allow from <TRAEFIK_VM_IP> to any port 3002 proto tcp
```

## 5. On the Traefik VM: add the route

Put the dynamic file in place (Traefik picks it up automatically, no restart). Either
copy it from the clone:
```bash
scp <user>@192.168.1.25:~/LifeController/traefik/things.yml /etc/traefik/dynamic/things.yml
```
or create `/etc/traefik/dynamic/things.yml` by hand with:
```yaml
http:
  routers:
    things:
      rule: "Host(`things.vikane.cloud`)"
      entryPoints: [websecure]
      service: things-svc
      tls:
        certResolver: letsencrypt
  services:
    things-svc:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://192.168.1.25:3002"
```

## 6. Verify

Open **https://things.vikane.cloud**. Traefik fetches the Let's Encrypt cert on the
first request. Sign in with Google — the first login with **`avikane@gmail.com`**
becomes admin; everyone else is *pending* until you approve them in **Admin → Users**.

## Day-2 operations (Option A)

```bash
cd LifeController
export COMPOSE_FILE=compose.vm.yml

# Update to latest code
git pull && docker compose up -d --build app
bash scripts/migrate.sh        # only if the schema changed

# Logs / restart / stop (data volumes are kept on `down`)
docker compose logs -f app
docker compose restart
docker compose down

# Backup (DB dump + uploads → ./backups). Automate with cron:
bash scripts/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * cd $PWD && COMPOSE_FILE=compose.vm.yml bash scripts/backup.sh >> backups/cron.log 2>&1" ) | crontab -
```

## Troubleshooting (Option A)

| Symptom | Fix |
| --- | --- |
| `things.vikane.cloud` doesn't resolve | Add the A record (or confirm the wildcard) and wait for propagation: `dig +short things.vikane.cloud`. |
| 404 / "no route" from Traefik | Check `/etc/traefik/dynamic/things.yml` exists and the `Host()` matches; Traefik logs should show the new router. Names `websecure`/`letsencrypt` must match your static config. |
| Traefik can't reach the app (502/bad gateway) | `curl -I http://192.168.1.25:3002` from the Traefik VM. If it fails, check the `ufw` rule and that the container is up (`docker compose ps`). |
| Google `redirect_uri_mismatch` | Redirect URI must be exactly `https://things.vikane.cloud/api/auth/callback/google` and `AUTH_URL` must equal `https://things.vikane.cloud`. |
| App errors about missing tables | Re-run `bash scripts/migrate.sh` (with `COMPOSE_FILE=compose.vm.yml`). |
| Locked out of admin | On the pending screen, click "I have an admin code" and enter `adminSecureCode` from `settings.json`. |

---

# Option B — standalone with built-in Caddy TLS

For a fresh server with **no** existing reverse proxy. Caddy (bundled in
`compose.prod.yml`) gets the certificate itself.

```bash
git clone https://github.com/lucide85/LifeController.git && cd LifeController
cp .env.example .env && cp settings.example.json settings.json
# In .env set: DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, AUTH_SECRET,
#              AUTH_URL=https://<DOMAIN>, Google creds, ANTHROPIC_API_KEY
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

docker compose -f compose.prod.yml up -d db
COMPOSE_FILE=compose.prod.yml bash scripts/migrate.sh
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml logs -f caddy   # wait for "certificate obtained"
```
Requires DNS for `DOMAIN` → the server's public IP and ports 80/443 open to the internet.
