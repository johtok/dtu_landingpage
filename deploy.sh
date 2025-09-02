#!/usr/bin/env bash
set -euo pipefail

REMOTE="gbar"
REMOTE_DIR="public_html"

# 1. Build site
zola build

# 2. Ensure remote directory exists
ssh "$REMOTE" "mkdir -p ~/${REMOTE_DIR}"

# 3. Sync Zola output
rsync -avz --delete \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  public/ "${REMOTE}:${REMOTE_DIR}/"

echo "✅ Deployed Zola site -> ${REMOTE}:${REMOTE_DIR}"

