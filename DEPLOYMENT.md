# Production Deployment Guide

## Current deployment: all-in-one droplet

Production uses `docker-compose.prod.allinone.yml`: local Postgres, Redis,
WebSocket server, Next.js, Discord bot, Caddy, TURN and scheduled jobs.
GitHub Actions builds the three application images on separate Linux amd64
runners and publishes them to GHCR with the full commit SHA as the tag.
The droplet only pulls and runs images.

The **Production** GitHub environment must contain the existing deployment secrets:

- `DO_PROD_HOST`: the all-in-one droplet's SSH host.
- `DO_PROD_USER`: an SSH user with Docker access and write access to the checkout.
- `DO_PROD_SSH_KEY`: that user's SSH private key.
- `DO_PROD_APP_DIR`: the existing absolute checkout directory. Keep this unchanged
  to preserve Compose's volume and network names, including the calendar network.

The checkout must have `.env.production` and `.env.frontend`. Actions reads
`.env.frontend` over SSH and supplies it to the Next.js build as a BuildKit secret;
it is not committed or copied into the image. `NEXT_PUBLIC_*` values are embedded
in the browser build. Editing them requires another workflow run. The frontend
build stage bypasses cache on reruns to pick up env changes.

Push to `main`, or run **Deploy to Production** manually on `main`. The workflow
uses its own `GITHUB_TOKEN` to publish and pull images; no separate registry token
is required. Repository/organization policy must allow Actions to write packages.
If both repository mirrors have Actions enabled, configure production deployment
credentials only in the repository that should deploy.

After all images build successfully, the workflow checks out the matching commit
on the droplet, pulls images, starts Postgres and Redis, runs `prisma migrate deploy`
(a no-op for an already migrated database), and waits for the application health
checks before starting dependent services. It reloads Caddy's routing config.
It leaves existing data volumes in place and refuses to discard local tracked
changes. A failed migration stops deployment before application containers change.
The single server/frontend instances may briefly interrupt connections on restart.

Requirements: Docker Compose v2 with `up --wait` support, an amd64 droplet, SSH
access from GitHub-hosted runners, and Git access from the droplet to its origin.
Set the optional GitHub variable `WS_HEALTH_URL` to enable an external WebSocket
HTTP health check in addition to the required container health checks.

The workflow writes the image selection to `.env.images` in the checkout. After
deployment, inspect or restart the same release from that directory:

```bash
docker compose --env-file .env.images -f docker-compose.prod.allinone.yml ps
docker compose --env-file .env.images -f docker-compose.prod.allinone.yml logs --tail 100 frontend server1
docker compose --env-file .env.images -f docker-compose.prod.allinone.yml up -d --no-build
```

Registry credentials are temporary and removed after deployment. For a manual
pull of private images, first log in to GHCR with a token granting `read:packages`.
Do not use `down -v`: it would remove the local database and other persisted data.

## Legacy split deployment

The instructions below describe the previous Vercel/separate-server deployment.
Use the all-in-one workflow above for current production.

## Prerequisites

1. **Generate Redis Password**
   ```bash
   # Generate a strong random password
   openssl rand -base64 32
   ```

2. **Generate NextAuth Secret**
   ```bash
   openssl rand -base64 32
   ```

## Environment Setup

### 1. Create Production Environment File

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and update:
- `REDIS_PASSWORD` - Use the generated password
- `REDIS_URL` - Include the password: `redis://:YOUR_PASSWORD@redis:6379`
- `NEXTAUTH_SECRET` - Use the generated secret
- `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL` - Your Postgres credentials
- `NEXTAUTH_URL`, `WEB_AUTHN_ORIGIN`, `WEB_AUTHN_RP_ID` - Your production domain

### 2. Configure Vercel Environment Variables

In your Vercel dashboard, add:

```bash
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@YOUR_DROPLET_IP:6380
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://realms.cards
NEXTAUTH_SECRET=YOUR_NEXTAUTH_SECRET
# ... (copy other vars from .env.production)
```

## Deployment Steps

### 1. Deploy Docker Services on Droplet

```bash
# On your droplet
cd /path/to/sorcery-client

# Pull latest changes
git pull origin main

# Build and start services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# Verify Redis is password protected
docker exec sorcery-redis redis-cli -a YOUR_REDIS_PASSWORD ping
# Should respond: PONG
```

### 2. Verify Redis Connectivity

**From the droplet (should work):**
```bash
redis-cli -h localhost -p 6380 -a YOUR_REDIS_PASSWORD ping
```

**From external (should work only from Vercel IPs):**
```bash
redis-cli -h YOUR_DROPLET_IP -p 6380 -a YOUR_REDIS_PASSWORD ping
```

### 3. Deploy Next.js to Vercel

```bash
# Vercel will auto-deploy on git push, or manually:
vercel --prod
```

## Security Hardening

### Option 1: Firewall Rules (Recommended)

Restrict Redis port 6380 to Vercel IP ranges only:

```bash
# Get Vercel IP ranges from: https://vercel.com/docs/edge-network/regions
# Example (update with actual Vercel IPs):
sudo ufw allow from 76.76.21.0/24 to any port 6380
sudo ufw allow from 76.76.19.0/24 to any port 6380
sudo ufw deny 6380
sudo ufw reload
```

### Option 2: VPN/Tunnel (Most Secure)

Set up Tailscale or Cloudflare Tunnel:
- Keep Redis on internal network only (remove port exposure)
- Connect Vercel via private network
- No public Redis exposure

### Option 3: IP Whitelist in Redis

Edit `docker-compose.prod.yml`:
```yaml
redis:
  command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}", "--bind", "0.0.0.0", "--protected-mode", "yes"]
```

## Monitoring

### Check Service Health

```bash
# View all service logs
docker-compose -f docker-compose.prod.yml logs -f

# Check specific services
docker logs -f sorcery-server-1
docker logs -f sorcery-server-2
docker logs -f sorcery-redis

# Check Redis connections
docker exec sorcery-redis redis-cli -a YOUR_REDIS_PASSWORD CLIENT LIST
```

### Verify Tournament Drafts

1. Create a tournament on https://realms.cards/tournaments
2. Start a draft
3. Make picks - should advance immediately without reload
4. Check server logs:
   ```bash
   docker logs -f sorcery-server-1 | grep "Socket/TournamentDraft"
   ```

## Rollback

If issues occur:

```bash
# Stop services
docker-compose -f docker-compose.prod.yml down

# Revert to previous version
git checkout PREVIOUS_COMMIT_HASH

# Restart
docker-compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

### Redis Connection Failures

**Symptom:** `[Socket/TournamentDraft] Pick error: fetch failed`

**Solutions:**
1. Check Redis is running: `docker ps | grep redis`
2. Test password: `docker exec sorcery-redis redis-cli -a PASSWORD ping`
3. Verify Next.js can reach Redis:
   - Check `REDIS_URL` in Vercel env vars
   - Test from Vercel: Add debug API route

### Tournament Drafts Not Advancing

**Symptom:** Picks don't progress, stuck waiting

**Solutions:**
1. Check server logs: `docker logs sorcery-server-1 | grep TournamentDraft`
2. Verify WebSocket connection: Browser console should show `[useSocket] Connected`
3. Check Redis pub/sub is working:
   ```bash
   docker exec sorcery-redis redis-cli -a PASSWORD MONITOR
   ```

### High Memory Usage

**Symptom:** Server OOM errors

**Solutions:**
1. Limit Redis memory: Add to docker-compose.prod.yml:
   ```yaml
   redis:
     command: [..., "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lru"]
   ```
2. Reduce texture cache: Update env vars:
   ```
   NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=200
   ```

## Performance Tuning

### Redis Optimization

```yaml
redis:
  command: [
    "redis-server",
    "--appendonly", "yes",
    "--requirepass", "${REDIS_PASSWORD}",
    "--maxmemory", "1gb",
    "--maxmemory-policy", "allkeys-lru",
    "--save", "900 1",
    "--save", "300 10",
    "--save", "60 10000"
  ]
```

### Socket.IO Scaling

Already configured with Redis adapter for horizontal scaling:
- `server1` and `server2` share state via Redis
- Caddy load balances with sticky sessions (`lb_policy cookie`)

To add more servers, add `server3`, `server4`, etc. to docker-compose.prod.yml

## Backup

### Redis Data Backup

```bash
# Manual backup
docker exec sorcery-redis redis-cli -a PASSWORD SAVE
docker cp sorcery-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb

# Automated daily backup (add to crontab)
0 2 * * * /path/to/backup-redis.sh
```

### Database Backup

```bash
# Postgres backup (if self-hosted)
docker exec sorcery-postgres pg_dump -U sorcery sorcery > backup-$(date +%Y%m%d).sql
```

## Post-Deployment Checklist

- [ ] Redis password set and verified
- [ ] Port 6380 restricted to Vercel IPs
- [ ] All environment variables updated in Vercel
- [ ] Next.js deployed and running
- [ ] Socket servers running (both server1 and server2)
- [ ] WebSocket connection working (ws.realms.cards)
- [ ] Tournament drafts advance without reload
- [ ] No console errors in browser
- [ ] Server logs clean (no fetch failures)
- [ ] Redis connections stable
- [ ] Monitoring/alerts configured

## Support

For issues:
- Check server logs: `docker-compose -f docker-compose.prod.yml logs`
- Open an issue on GitHub
