# Deploying LifeController to an Ubuntu VM with Docker

This sets up the full production stack on one Ubuntu server:

```
Internet ──► Caddy (auto-HTTPS) ──► Next.js app ──► PostgreSQL + pgvector
                                          └──► local-disk uploads (Docker volume)
```

Everything runs in Docker via `compose.prod.yml`. You only need Docker on the VM —
no Node, no manual TLS.

---

## 0. Before you start

You need:
- An **Ubuntu VM** (≥ 2 GB RAM recommended for the build) with **Docker** + the
  Compose plugin, and a sudo user.
- A **domain** whose DNS **A record** you can point at the VM's public IP.
- **Ports 80 and 443 open** to the internet (both in your cloud provider's
  security group/firewall *and* the VM's `ufw`).
- API credentials ready: Google OAuth client, `ANTHROPIC_API_KEY`, and
  (optional) `VOYAGE_API_KEY`.

Check Docker is present:
```bash
docker --version && docker compose version
```
If not installed:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # log out & back in so the group takes effect
```

---

## 1. Point your domain at the VM

In your DNS provider, add an **A record**:

| Type | Name | Value |
| --- | --- | --- |
| A | `lifecontroller` (or `@`) | `<your VM's public IP>` |

Confirm it resolves (wait for propagation):
```bash
dig +short your-domain.example
```

## 2. Open the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
Also make sure your cloud provider's security group allows 80 + 443 inbound.

## 3. Clone the repo

```bash
git clone https://github.com/lucide85/LifeController.git
cd LifeController
```

## 4. Configure secrets

```bash
cp .env.example .env
cp settings.example.json settings.json
```

Generate strong secrets:
```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "adminSecureCode=$(openssl rand -hex 32)"
```

Edit **`.env`** (`nano .env`) and set at least:
```ini
DOMAIN=your-domain.example
ACME_EMAIL=you@example.com
POSTGRES_PASSWORD=<the value generated above>

AUTH_SECRET=<the value generated above>
AUTH_URL=https://your-domain.example
NEXTAUTH_URL=https://your-domain.example

AUTH_GOOGLE_ID=<google client id>
AUTH_GOOGLE_SECRET=<google client secret>
ADMIN_EMAIL=avikane@gmail.com

ANTHROPIC_API_KEY=<your key>
VOYAGE_API_KEY=<your key, optional>
```

Edit **`settings.json`** and paste the generated `adminSecureCode`.

> `.env` and `settings.json` are gitignored — they never leave the VM.

## 5. Google OAuth redirect URI

In https://console.cloud.google.com/apis/credentials → your OAuth client →
**Authorized redirect URIs**, add **exactly**:
```
https://your-domain.example/api/auth/callback/google
```

## 6. Bring it up

```bash
# 1) Start the database
docker compose -f compose.prod.yml up -d db

# 2) Create the pgvector extension + schema (no Node needed)
bash scripts/migrate.sh

# 3) Build and start the app + Caddy (first build takes a few minutes)
docker compose -f compose.prod.yml up -d --build

# 4) Watch Caddy obtain the TLS certificate
docker compose -f compose.prod.yml logs -f caddy
```
When Caddy logs `certificate obtained successfully`, press Ctrl-C.

## 7. Verify

```bash
docker compose -f compose.prod.yml ps          # all services "running"/"healthy"
curl -I https://your-domain.example            # expect HTTP/2 200 or 307
```
Open `https://your-domain.example` in a browser and sign in with Google.
The first login with **`avikane@gmail.com`** becomes admin automatically; anyone
else lands as *pending* until you approve them under **Admin → Users**.

---

## Day-2 operations

**Update to the latest code:**
```bash
git pull
docker compose -f compose.prod.yml up -d --build app
bash scripts/migrate.sh      # only needed if the schema changed
```

**Logs:**
```bash
docker compose -f compose.prod.yml logs -f app
docker compose -f compose.prod.yml logs -f caddy
```

**Backups** (database dump + uploaded files → `./backups`):
```bash
bash scripts/backup.sh
```
Automate daily at 03:30 with cron:
```bash
( crontab -l 2>/dev/null; echo "30 3 * * * cd $PWD && bash scripts/backup.sh >> backups/cron.log 2>&1" ) | crontab -
```

**Restart / stop:**
```bash
docker compose -f compose.prod.yml restart
docker compose -f compose.prod.yml down        # stop (keeps data volumes)
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Caddy can't get a certificate | DNS must resolve to this VM and ports 80/443 must be open. Check `docker compose -f compose.prod.yml logs caddy`. |
| Google `redirect_uri_mismatch` | The redirect URI in Google Console must be **exactly** `https://<DOMAIN>/api/auth/callback/google`, and `AUTH_URL` must equal `https://<DOMAIN>`. |
| Build runs out of memory | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`, then rebuild. |
| App errors about missing tables | Re-run `bash scripts/migrate.sh`. |
| 502 from Caddy | App still building/starting — check `docker compose -f compose.prod.yml logs app`. |
| Locked out of admin | On the *pending* screen, click "I have an admin code" and enter `adminSecureCode` from `settings.json`. |
