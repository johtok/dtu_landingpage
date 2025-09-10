#!/usr/bin/env bash
set -euo pipefail

REMOTE="gbar"
REMOTE_DIR="public_html"

# 1. Build site
zola build

# 1b. Optionally export TensorBoard runs into public/master-data
if [[ -n "${TB_LOGDIR:-}" ]]; then
  echo "↻ Exporting TensorBoard runs from $TB_LOGDIR -> public/master-data"
  if command -v python3 >/dev/null 2>&1; then
    python3 tools/tb_export.py --logdir "$TB_LOGDIR" --outdir public/master-data || {
      echo "Warning: TensorBoard export failed; continuing with deploy." >&2
    }
  else
    echo "Warning: python3 not found; skipping TensorBoard export." >&2
  fi
fi

# 2. Ensure remote directory exists
ssh "$REMOTE" "mkdir -p ~/${REMOTE_DIR}"

# 3. Sync Zola output
rsync -avz --delete \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  public/ "${REMOTE}:${REMOTE_DIR}/"

echo "✅ Deployed Zola site -> ${REMOTE}:${REMOTE_DIR}"
