#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git fetch origin && git reset --hard origin/master
cd backend && node_modules/.bin/node-pg-migrate up && npm ci --omit=dev && systemctl restart cooklyt-pos-api
cd ..
for d in dashboard admin menu; do ( cd "$d" && npm ci && npm run build ); done
