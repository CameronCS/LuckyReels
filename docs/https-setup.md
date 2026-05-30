# HTTPS / WSS Setup

Lucky Reels currently runs plain HTTP and WS. In production, all traffic should be encrypted so that credentials and session tokens cannot be intercepted in transit. The recommended approach is a **reverse proxy** (Nginx or Caddy) in front of Node rather than wiring TLS directly into `server.js` — the proxy handles certificates and forwards plain traffic locally.

---

## Option A — Caddy (recommended, easiest)

Caddy obtains and renews a Let's Encrypt certificate automatically with zero configuration.

### 1. Install Caddy

```bash
# Ubuntu / Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 2. Create a Caddyfile

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically provisions the TLS certificate, upgrades HTTP → HTTPS, and proxies both HTTP and WebSocket traffic (WS → WSS). No further configuration needed.

### 3. Start Caddy

```bash
sudo systemctl enable --now caddy
```

That's it. Your site will be reachable at `https://your-domain.com` and WebSocket connections will use `wss://` automatically.

---

## Option B — Nginx + Certbot

More steps but gives you finer control over headers and rate limits.

### 1. Install Nginx and Certbot

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Create an Nginx site config

`/etc/nginx/sites-available/lucky-reels`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;

        # Required for WebSocket upgrades
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;  # keep WS connections alive
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lucky-reels /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Obtain a certificate

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot patches the Nginx config to add the HTTPS server block and sets up auto-renewal via a systemd timer.

### 4. Verify auto-renewal

```bash
sudo certbot renew --dry-run
```

---

## What changes in the app

**Nothing.** The client-side code in `index.js` already handles the protocol switch:

```js
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);
```

When the page is served over HTTPS, `wsProto` becomes `wss` automatically. The proxy forwards `wss://your-domain.com` → `ws://localhost:3000` transparently.

---

## Local development

For local dev, plain HTTP/WS on `localhost` is acceptable — browsers don't flag `localhost` as insecure. Only enforce HTTPS in staging and production environments.

If you need HTTPS locally (e.g. for testing secure cookies), use [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# Install mkcert and create a local CA
mkcert -install

# Generate a cert for localhost
mkcert localhost 127.0.0.1

# This creates:
#   localhost+1.pem      (certificate)
#   localhost+1-key.pem  (private key)
```

Then swap the HTTP server in `server.js` for an HTTPS one:

```js
const https = require('https');
const fs    = require('fs');

const server = https.createServer({
  cert: fs.readFileSync('localhost+1.pem'),
  key:  fs.readFileSync('localhost+1-key.pem'),
}, requestHandler);
```

Remove this before committing — never commit certificate files.

---

## Security headers to add once on HTTPS

Once TLS is in place, tighten the `server.js` CSP to remove `'unsafe-inline'` and add HSTS:

```js
headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
// Change style-src to remove 'unsafe-inline' once inline styles are extracted to .css files
```
