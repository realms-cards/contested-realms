# Self-Hosted Frontend Deployment Guide

This guide covers deploying the Next.js frontend alongside the existing backend on your droplet, replacing Vercel.

## Overview

**Before (Vercel):**

```
realms.cards → Vercel ($$$ Edge Requests)
ws.realms.cards → Your Droplet (Socket.IO)
```

**After (Self-Hosted):**

```
realms.cards → Your Droplet (Next.js container)
ws.realms.cards → Your Droplet (Socket.IO)
```

**Benefits:**

- No Vercel costs (Edge Requests, CPU, bandwidth)
- Lower latency (frontend/backend same network)
- Redis internal-only (more secure)
- Full control over caching and deployment

## Prerequisites

- Existing droplet running `docker-compose.prod.yml`
- Domain DNS access for `realms.cards` and `staging.realms.cards`
- ~2GB additional RAM (frontend uses ~512MB-1GB)

## Deployment Strategy: Blue-Green with Staging

### Phase 1: Deploy to Staging (Zero Downtime)

1. **Add DNS record for staging:**

   ```
   staging.realms.cards → A record → YOUR_DROPLET_IP
   ```

2. **SSH to your droplet and pull changes:**

   ```bash
   cd /path/to/sorcery-client
   git pull origin main
   ```

3. **Build and deploy the full stack:**

   ```bash
   # Stop existing stack (backend only)
   docker-compose -f docker-compose.prod.yml down

   # Start new stack with frontend
   docker-compose -f docker-compose.prod.frontend.yml up -d --build
   ```

4. **Wait for all services to be healthy:**

   ```bash
   docker-compose -f docker-compose.prod.frontend.yml ps
   # All should show "healthy"

   # Check logs if issues
   docker logs sorcery-frontend
   ```

5. **Test staging:**
   - Visit https://staging.realms.cards
   - Test login, collection, tournaments
   - Verify WebSocket connection works
   - Check browser console for errors

### Phase 2: DNS Cutover

Once staging is verified:

1. **Update DNS for main domain:**

   ```
   realms.cards → A record → YOUR_DROPLET_IP
   ```

   (Remove or keep Vercel CNAME as backup)

2. **Wait for DNS propagation (1-15 minutes typically)**

3. **Verify production:**
   - Visit https://realms.cards
   - Clear browser cache if needed
   - Test all critical flows

### Rollback Plan

If issues occur after DNS cutover:

**Option A: Instant DNS Rollback (Recommended)**

```
realms.cards → CNAME → your-project.vercel.app
```

- Takes 1-15 minutes to propagate
- Zero code changes needed
- Vercel deployment still exists

**Option B: Revert to Backend-Only Stack**

```bash
# On droplet
docker-compose -f docker-compose.prod.frontend.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# Then point DNS back to Vercel
```

## Environment Variables

### Required in `.env.production`

```bash
# Database (unchanged)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Redis (now internal, no external port needed)
REDIS_PASSWORD=your-redis-password
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# Auth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://realms.cards

# WebAuthn
WEB_AUTHN_ORIGIN=https://realms.cards
WEB_AUTHN_RP_ID=realms.cards

# Discord OAuth (unchanged)
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...

# Public URLs (baked into frontend at build time)
NEXT_PUBLIC_SOCKET_URL=https://ws.realms.cards
NEXT_PUBLIC_BASE_URL=https://realms.cards
```

### Build Arguments

These are passed at Docker build time (see `docker-compose.prod.frontend.yml`):

- `NEXT_PUBLIC_SOCKET_URL`
- `NEXT_PUBLIC_BASE_URL`
- `NEXTAUTH_URL`

## Resource Usage

Expected resource consumption on 8GB RAM / 60GB disk droplet:

| Service   | Memory      | CPU         |
| --------- | ----------- | ----------- |
| frontend  | 512MB-1GB   | 5-15%       |
| server1   | 256MB-512MB | 5-10%       |
| server2   | 256MB-512MB | 5-10%       |
| redis     | 100MB-512MB | 1-5%        |
| caddy     | 50MB        | 1%          |
| **Total** | **~2-3GB**  | **~20-40%** |

You have plenty of headroom.

## Monitoring

### Health Checks

```bash
# Check all service health
docker-compose -f docker-compose.prod.frontend.yml ps

# Frontend health endpoint
curl https://realms.cards/api/health

# Socket server health
curl https://ws.realms.cards/healthz
```

### Logs

```bash
# All logs
docker-compose -f docker-compose.prod.frontend.yml logs -f

# Frontend only
docker logs -f sorcery-frontend

# Socket servers
docker logs -f sorcery-server-1
docker logs -f sorcery-server-2
```

### Resource Usage

```bash
docker stats
```

## Updating

```bash
cd /path/to/sorcery-client
git pull origin main

# Rebuild and restart (zero-downtime with healthchecks)
docker-compose -f docker-compose.prod.frontend.yml up -d --build

# Or restart specific service
docker-compose -f docker-compose.prod.frontend.yml up -d --build frontend
```

## Security Notes

1. **Redis is now internal-only** - No external port exposed
2. **Admin routes protected by IP** - Set `ADMIN_IP_ACCESSLIST` in `.env.production`
3. **Metrics endpoint protected** - Set `METRICS_IP_ALLOWLIST` in `.env.production`
4. **TLS handled by Caddy** - Automatic Let's Encrypt certificates

## Troubleshooting

### Frontend won't start

```bash
# Check build logs
docker-compose -f docker-compose.prod.frontend.yml logs frontend

# Common issues:
# - Missing env vars → check .env.production
# - Prisma client not generated → rebuilds should handle this
# - Port conflict → check nothing else on port 3000 internally
```

### WebSocket connection fails

```bash
# Verify CORS origin matches
# In Caddyfile.prod.frontend, Access-Control-Allow-Origin should be https://realms.cards

# Check socket server logs
docker logs sorcery-server-1 | grep -i cors
```

### Slow initial load

First request after deploy triggers ISR regeneration. Subsequent requests are fast.

```bash
# Pre-warm by hitting key routes
curl https://realms.cards
curl https://realms.cards/collection
curl https://realms.cards/tournaments
```

### SSL Certificate Issues

Caddy handles this automatically, but if issues:

```bash
# Check Caddy logs
docker logs sorcery-caddy

# Force certificate renewal
docker-compose -f docker-compose.prod.frontend.yml restart caddy
```

## Cost Savings

Moving from Vercel to self-hosted:

| Cost Item            | Vercel | Self-Hosted   |
| -------------------- | ------ | ------------- |
| Edge Requests        | $$$$   | $0            |
| Fast Data Transfer   | $$$    | $0            |
| Function Invocations | $$     | $0            |
| Droplet (existing)   | -      | Already paid  |
| **Monthly Savings**  |        | **~$50-200+** |

## Files Created

- `Dockerfile.frontend` - Next.js standalone build
- `docker-compose.prod.frontend.yml` - Full stack with frontend
- `Caddyfile.prod.frontend` - Routing for frontend + WebSocket
- `src/app/api/health/route.ts` - Health check endpoint
- `SELF_HOSTED_FRONTEND.md` - This guide

## Quick Reference

```bash
# Deploy full stack
docker-compose -f docker-compose.prod.frontend.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.frontend.yml ps

# View logs
docker-compose -f docker-compose.prod.frontend.yml logs -f

# Restart frontend only
docker-compose -f docker-compose.prod.frontend.yml restart frontend

# Stop everything
docker-compose -f docker-compose.prod.frontend.yml down

# Rollback to backend-only (then point DNS to Vercel)
docker-compose -f docker-compose.prod.frontend.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```
