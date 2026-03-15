# Production Deployment Guide

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
