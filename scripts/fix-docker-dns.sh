#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker first." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required for this script." >&2
  exit 1
fi

DAEMON_JSON="/etc/docker/daemon.json"
BACKUP="/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"

sudo mkdir -p /etc/docker

if [ -f "$DAEMON_JSON" ]; then
  echo "Backing up existing $DAEMON_JSON to $BACKUP"
  sudo cp "$DAEMON_JSON" "$BACKUP"
fi

cat <<'JSON' | sudo tee "$DAEMON_JSON" >/dev/null
{
  "dns": ["1.1.1.1", "8.8.8.8"],
  "features": {
    "buildkit": true
  }
}
JSON

echo "Restarting Docker daemon..."
sudo systemctl restart docker

echo "Verifying DNS from inside Docker..."
docker run --rm node:22 node -e "require('dns').resolve('registry.npmjs.org',(e,r)=>{if(e){console.error('DNS_FAIL',e.code||e.message);process.exit(2)};console.log('DNS_OK',r[0])})"

echo "Docker DNS fix applied successfully."
