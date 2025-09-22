Great—context is set to “myteam.” Below are exact, copy-pasteable commands for provisioning in FRA (fra1), plus how to use cloud-init.yaml step-by-step. I’ve corrected the earlier pool command to the proper doctl syntax: it’s doctl databases pool … (singular).

Note on CDN regions
- DigitalOcean Spaces does not have a “fra1” region. For EU near FRA, use ams3. For US East, use nyc3.
- We’ll set up two CDN endpoints:
  - EU: ams3
  - US: nyc3

1) Managed Postgres in fra1
Create a PostgreSQL cluster, then a database, a user, and a transaction pool. Finally, get both the primary (DIRECT_URL) and pooled (DATABASE_URL) connection URIs.

- Create the database cluster (Postgres 16, 1 node, small size)
```bash
doctl databases create contested-realms-pg \
  --engine pg \
  --region fra1 \
  --size db-s-1vcpu-1gb \
  --num-nodes 1 \
  --version 16
```

- Capture the DB ID for subsequent commands
```bash
PG_ID=$(doctl databases list --no-header --format Name,ID | awk '$1=="contested-realms-pg"{print $2}')
echo "PG_ID=$PG_ID"
```

- Create the logical database and an app user
```bash
doctl databases db create "$PG_ID" sorcery
doctl databases user create "$PG_ID" app
```

- Create a transaction pool for the app (correct subcommand is “pool”)
```bash
doctl databases pool create "$PG_ID" app-pool \
  --db sorcery \
  --mode transaction \
  --size 20 \
  --user app
```

- Get the direct/primary connection for Prisma migrations (DIRECT_URL)
```bash
DIRECT_URL=$(doctl databases connection "$PG_ID" --no-header --format URI)
echo "DIRECT_URL=$DIRECT_URL"
```

- Get the pooled connection for the app (DATABASE_URL)
```bash
DATABASE_URL=$(doctl databases pool list "$PG_ID" --no-header --format Name,URI | awk '$1=="app-pool"{print $2}')
echo "DATABASE_URL=$DATABASE_URL"
```

- Ensure sslmode=require
If your URIs don’t include sslmode=require, append it (and schema=public) for Prisma:
```bash
DIRECT_URL="${DIRECT_URL}?sslmode=require&schema=public"
DATABASE_URL="${DATABASE_URL}?sslmode=require&schema=public"
echo "DIRECT_URL=$DIRECT_URL"
echo "DATABASE_URL=$DATABASE_URL"
```

2) Droplet in fra1 using cloud-init
The provided cloud-init.yaml installs Docker + Compose, clones your repo, creates .env.production from the template, and optionally starts the stack if env is complete.

- Replace REPO_URL in cloud-init.yaml with your repo HTTPS URL (macOS sed)
```bash
sed -i '' -e 's|REPO_URL|https://github.com/<your-org-or-user>/sorcery-client.git|g' cloud-init.yaml
```

- Identify your SSH key ID (pick the correct one)
```bash
doctl compute ssh-key list
# Optionally:
# SSH_KEY_ID=$(doctl compute ssh-key list --no-header --format ID,Name | awk '$2=="<your-key-name>"{print $1}')
```

- Create the Droplet (Ubuntu 24.04, FRA, tagged)
```bash
doctl compute droplet create realms-ws-1 \
  --region fra1 \
  --size s-2vcpu-2gb \
  --image ubuntu-24-04-x64 \
  --tag-names contested-realms \
  --ssh-keys <YOUR_SSH_KEY_ID> \
  --user-data-file cloud-init.yaml \
  --wait
```

- Get the Droplet’s public IP
```bash
DROPLET_IP=$(doctl compute droplet get realms-ws-1 --no-header --format PublicIPv4)
echo "DROPLET_IP=$DROPLET_IP"
```

- Create a firewall and attach by tag (allows only 22, 80, 443)
```bash
doctl compute firewall create \
  --name contested-realms-fw \
  --inbound-rules "protocol:tcp,ports:22,addresses:0.0.0.0/0,::/0" \
  --inbound-rules "protocol:tcp,ports:80,addresses:0.0.0.0/0,::/0" \
  --inbound-rules "protocol:tcp,ports:443,addresses:0.0.0.0/0,::/0" \
  --outbound-rules "protocol:tcp,ports:all,addresses:0.0.0.0/0,::/0" \
  --outbound-rules "protocol:udp,ports:all,addresses:0.0.0.0/0,::/0" \
  --tag-names contested-realms
```

Optional: Assign resources to a DO Project
- If you already have a project, get its ID and attach resources:
```bash
doctl projects list
PROJECT_ID=<YOUR_PROJECT_ID>
DROPLET_ID=$(doctl compute droplet get realms-ws-1 --no-header --format ID)
doctl projects resources assign "$PROJECT_ID" \
  --resource "do:droplet:$DROPLET_ID" \
  --resource do:database:"$PG_ID" # geht ned, manuell machen!
```

3) DNS for realms.cards
If your domain is already imported to DO, create the records:

- Apex to Vercel Anycast
```bash
doctl compute domain records create realms.cards \
  --record-type A \
  --record-name @ \
  --record-data 76.76.21.21 \
  --record-ttl 300
```

- www to Vercel CNAME
```bash
doctl compute domain records create realms.cards \
  --record-type CNAME \
  --record-name www \
  --record-data cname.vercel-dns.com. \
  --record-ttl 300
```

- ws to Droplet A record
```bash
doctl compute domain records create realms.cards \
  --record-type A \
  --record-name ws \
  --record-data "$DROPLET_IP" \
  --record-ttl 300
```

4) Using cloud-init.yaml (what it does and what you do next)
- What it does (see [cloud-init.yaml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/cloud-init.yaml:0:0-0:0)):
  - Installs Docker, docker-compose plugin, git, curl, jq.
  - Writes `/etc/docker/daemon.json` with sane log rotation.
  - Clones your repo into `/opt/sorcery-client` (from the REPO_URL you replaced).
  - Copies [env.production.example](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/env.production.example:0:0-0:0) to `.env.production` if it doesn’t exist.
  - If `.env.production` contains non-empty NEXTAUTH_SECRET, DATABASE_URL, DIRECT_URL, REDIS_URL, it runs:
    - `docker compose -f docker-compose.prod.yml up -d --build`
  - Writes `DEPLOY_README.txt` with instructions.

- What you must do after Droplet is up:
  1) SSH in and edit the env file
  ```bash
  ssh root@"$DROPLET_IP"
  cd /opt/sorcery-client
  nano .env.production
  ```
  Fill:
  - `NEXTAUTH_SECRET=<same value you’ll set on Vercel>`
  - `DATABASE_URL=<pooled URI from step 1 + sslmode=require&schema=public>`
  - `DIRECT_URL=<primary URI from step 1 + sslmode=require&schema=public>`
  - `REDIS_URL=redis://redis:6379`  (self-hosted Redis in docker-compose.prod.yml)
  - `SOCKET_REQUIRE_JWT=true`
  - `SOCKET_CORS_ORIGIN=https://realms.cards,https://*.vercel.app`

  2) Start the stack (if cloud-init didn’t auto-start)
  ```bash
  docker compose -f docker-compose.prod.yml up -d --build
  ```

  3) Check logs for readiness
  ```bash
  docker compose -f docker-compose.prod.yml logs -f caddy server1 server2
  ```

  4) Once DNS for ws.realms.cards is set and propagated, verify health (Caddy + LE)
  ```bash
  curl -fsS https://ws.realms.cards/healthz | jq .
  ```

5) Optional: Managed Redis (if you later enable it)
If you do move to Managed Redis, you can provision it like this, then swap REDIS_URL:
```bash
doctl databases create contested-realms-redis \
  --engine redis \
  --region fra1 \
  --size db-s-1vcpu-1gb \
  --num-nodes 1
REDIS_ID=$(doctl databases list --no-header --format Name,ID | awk '$1=="contested-realms-redis"{print $2}')
REDIS_URL=$(doctl databases connection "$REDIS_ID" --no-header --format URI)
echo "REDIS_URL=$REDIS_URL"
```
Update `.env.production` on the Droplet with that `REDIS_URL` (it will likely be rediss:// with TLS), then:
```bash
docker compose -f docker-compose.prod.yml restart server1 server2
```

6) CDN endpoints in EU (ams3) and US (nyc3)
Create two Spaces in the DO Control Panel (recommended), e.g.:
- EU: `realms-cdn-eu` (ams3)
- US: `realms-cdn-us` (nyc3)

Then create DO CDN endpoints pointing at each Space:
- EU CDN endpoint
```bash
CDN_EU_ID=$(doctl compute cdn create \
  realms-cdn-eu.ams3.digitaloceanspaces.com \
  --ttl 3600 \
  --no-header --format ID\
  -- domain eu.cdn.realms.cards)
echo "CDN_EU_ID=$CDN_EU_ID"
```

- US CDN endpoint
```bash
CDN_US_ID=$(doctl compute cdn create \
  realms-cdn-us.nyc3.digitaloceanspaces.com \
  --ttl 3600 \
  --no-header --format ID)
echo "CDN_US_ID=$CDN_US_ID"
```

Optionally attach custom hostnames and Let’s Encrypt certs:
- Create certificates
```bash
CERT_EU_ID=$(doctl compute certificate create \
  --type lets-encrypt \
  --name cdn-eu-realms-cards \
  --dns-names cdn-eu.realms.cards \
  --no-header --format ID)
echo "CERT_EU_ID=$CERT_EU_ID"

CERT_US_ID=$(doctl compute certificate create \
  --type lets-encrypt \
  --name cdn-us-realms-cards \
  --dns-names cdn-us.realms.cards \
  --no-header --format ID)
echo "CERT_US_ID=$CERT_US_ID"
```

- Update CDN endpoints to use the custom domains
```bash
doctl compute cdn update "$CDN_EU_ID" \
  --custom-domain cdn-eu.realms.cards \
  --certificate-id "$CERT_EU_ID"

doctl compute cdn update "$CDN_US_ID" \
  --custom-domain cdn-us.realms.cards \
  --certificate-id "$CERT_US_ID"
```

- DNS CNAMEs to the CDN endpoints
```bash
doctl domains records create realms.cards \
  --record-type CNAME \
  --record-name cdn-eu \
  --record-data realms-cdn-eu.ams3.cdn.digitaloceanspaces.com. \
  --record-ttl 300

doctl domains records create realms.cards \
  --record-type CNAME \
  --record-name cdn-us \
  --record-data realms-cdn-us.nyc3.cdn.digitaloceanspaces.com. \
  --record-ttl 300
```

How to set ASSET_CDN_ORIGIN in the app
- Pick one (EU or US) to start:
  - `ASSET_CDN_ORIGIN=https://cdn-eu.realms.cards`
- Later you can add geo-routing or a toggle to point US users at `https://cdn-us.realms.cards`.

Recap for cloud-init usage
- Replace REPO_URL in [cloud-init.yaml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/cloud-init.yaml:0:0-0:0) with your Git repo URL.
- Create the Droplet with `--user-data-file cloud-init.yaml`.
- SSH in, edit `/opt/sorcery-client/.env.production` with DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, REDIS_URL, etc.
- Start the stack with:
  - `docker compose -f docker-compose.prod.yml up -d --build`
- Point `ws.realms.cards` to the Droplet IP, wait for cert issuance, and confirm at `/healthz`.

If you want, I can generate a single shell script you can run locally that executes everything above (with your variables filled in).



Fail2ban:
To integrate Fail2ban with your Caddy running in Docker, I'll:
1) Bind-mount a host log directory into the Caddy container so the host's Fail2ban can read access logs.
2) Update cloud-init.yaml to install fail2ban, create a filter and jail tailored for Caddy's JSON access logs, create the log directory, and enable Fail2ban.

I'll now update docker-compose.prod.yml and cloud-init.yaml accordingly.











Excellent idea. I’ve wired Fail2ban into the Caddy setup so it can actively ban abusive IPs based on Caddy’s access logs.

What I changed in the repo
- Caddy log output
  - [Caddyfile.prod](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/Caddyfile.prod:0:0-0:0): logs are now written to `/var/log/caddy/access.log` in JSON format so Fail2ban can parse them.
    - File: [Caddyfile.prod](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/Caddyfile.prod:0:0-0:0)
    - Change: `log { output file /var/log/caddy/access.log; format json }`
- Compose bind mount + permissions
  - [docker-compose.prod.yml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/docker-compose.prod.yml:0:0-0:0): bind-mounts `/var/log/caddy` from the host into the Caddy container, and runs Caddy as root so it can write to that path.
    - File: [docker-compose.prod.yml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/docker-compose.prod.yml:0:0-0:0)
    - Changes:
      - `volumes: - /var/log/caddy:/var/log/caddy`
      - `user: root` on the `caddy` service
- Cloud-init: install and configure Fail2ban + logrotate
  - [cloud-init.yaml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/cloud-init.yaml:0:0-0:0):
    - Installs `fail2ban` and `logrotate`.
    - Creates a Fail2ban filter `caddy-json.conf` for Caddy JSON logs.
    - Creates a jail `jail.d/caddy.conf` to ban for many repeated 400/401/403/404/429s.
    - Ensures `/var/log/caddy` exists and enables `fail2ban`.
    - Adds `/etc/logrotate.d/caddy` so logs don’t grow unbounded.

How to use it

A) Fresh Droplet (recommended)
- Use the updated [cloud-init.yaml](cci:7://file:///Users/geleeroyale/CascadeProjects/sorcery-client/cloud-init.yaml:0:0-0:0) when creating the Droplet (as in the provisioning steps I gave).
- After the Droplet boots, verify:
```bash
ssh root@<DROPLET_IP>

# Verify the log dir and file are present
ls -lah /var/log/caddy
# After traffic, you should see access.log being created by Caddy

# Verify fail2ban is active and the caddy jail is loaded
systemctl status fail2ban --no-pager
fail2ban-client status
fail2ban-client status caddy
```

B) Existing Droplet (if you already created it)
Apply these steps once on the host:
```bash
# 1) Install fail2ban
apt-get update && apt-get install -y fail2ban

# 2) Prepare host log dir (bind-mounted in Compose)
mkdir -p /var/log/caddy
chmod 755 /var/log/caddy

# 3) Create Fail2ban filter for Caddy JSON access logs
tee /etc/fail2ban/filter.d/caddy-json.conf >/dev/null <<'EOF'
[Definition]
# Match Caddy JSON access logs for undesirable statuses
failregex = ^.*"request":\{"remote_addr":"<HOST>:[0-9]+".*"status":\s?(?:400|401|403|404|429).*$
ignoreregex =
EOF

# 4) Create jail for Caddy
tee /etc/fail2ban/jail.d/caddy.conf >/dev/null <<'EOF'
[caddy]
enabled = true
port = http,https
filter = caddy-json
logpath = /var/log/caddy/access.log
maxretry = 15
findtime = 10m
bantime = 1h
backend = auto
action = iptables-multiport[name=caddy, port="http,https"]
EOF

# 5) Optional: log rotation
tee /etc/logrotate.d/caddy >/dev/null <<'EOF'
/var/log/caddy/*.log {
  daily
  rotate 7
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
EOF

# 6) Pull latest Caddyfile/Compose changes and restart services
cd /opt/sorcery-client
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build

# 7) Enable and check Fail2ban
systemctl enable --now fail2ban
fail2ban-client reload
fail2ban-client status
fail2ban-client status caddy
```

Testing and operations
- Trigger a ban (be careful—don’t lock yourself out):
```bash
# From a test IP (NOT your admin IP), send repeated 404s:
for i in {1..25}; do curl -skI https://ws.realms.cards/does-not-exist; done

# Check jail status
fail2ban-client status caddy
# List banned IPs:
fail2ban-client status caddy | sed -n '/Banned IP list:/,$p'
```

- Unban an IP:
```bash
fail2ban-client set caddy unbanip <IP>
```

- View Fail2ban logs:
```bash
journalctl -u fail2ban --no-pager
```

- Tail Caddy access logs on host:
```bash
tail -F /var/log/caddy/access.log
```

Notes and considerations
- Default jail settings are conservative: 15 bad requests within 10 minutes → 1 hour ban. Adjust `maxretry`, `findtime`, `bantime` in `/etc/fail2ban/jail.d/caddy.conf` as needed.
- The filter matches 400/401/403/404/429. If you see false positives, remove 404 from the pattern or increase `maxretry`.
- If your Ubuntu uses nftables and you prefer it, switch the action line to:
  - `action = nftables-multiport[name=caddy, port="http,https"]`
- Because we bind-mount `/var/log/caddy`, Fail2ban runs on the host and can ban source IPs at the network layer, protecting Caddy and the Socket.IO servers behind it.

This slots neatly into our Droplet + Caddy plan from earlier memories and keeps your Realms stack resilient against noisy bots and brute force. If you want me to update README with a “Security (Fail2ban)” section, I can add a concise ops guide there as well.