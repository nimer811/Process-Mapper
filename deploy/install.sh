#!/usr/bin/env bash
# One-time setup of the Process AI demo on a fresh Ubuntu 24.04 server (run as root):
#   curl -fsSL https://raw.githubusercontent.com/nimer811/Process-Mapper/main/deploy/install.sh | bash
# Safe to run again: it updates the code and restarts the app, keeping data and settings.
set -euo pipefail

REPO="${REPO:-https://github.com/nimer811/Process-Mapper.git}"
DIR=/opt/process-ai

echo "==> Installing Docker and basics"
if ! command -v docker >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git ufw >/dev/null
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
apt-get install -y -qq git ufw >/dev/null

echo "==> Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# A little swap so building the image never runs out of memory on small servers.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Getting the code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR/deploy"

if [ ! -f .env ]; then
  echo "==> Creating settings (deploy/.env)"
  cp env.template .env
  ip=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN:-${ip//./-}.sslip.io}|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^DEMO_ACCESS_CODE=.*|DEMO_ACCESS_CODE=$(openssl rand -base64 9 | tr -dc 'A-Za-z0-9' | head -c 10)|" .env
  chmod 600 .env
fi

if ! grep -q '^LLM_API_KEY=.\+' .env; then
  echo
  echo "!! Add your OpenAI key to $DIR/deploy/.env (LLM_API_KEY=...), then run this script again."
  echo "   nano $DIR/deploy/.env"
  exit 0
fi

echo "==> Building and starting (first build takes a few minutes)"
docker compose up -d --build

echo "==> Nightly backups at 02:30"
( crontab -l 2>/dev/null | grep -v 'process-ai/deploy/backup.sh'; echo "30 2 * * * $DIR/deploy/backup.sh >> /var/log/process-ai-backup.log 2>&1" ) | crontab -
chmod +x backup.sh

domain=$(grep '^DOMAIN=' .env | cut -d= -f2)
code=$(grep '^DEMO_ACCESS_CODE=' .env | cut -d= -f2)
echo
echo "Process AI is starting at https://$domain"
echo "Access code: $code"
echo "(Certificates are issued on the first visit; give it a minute.)"
