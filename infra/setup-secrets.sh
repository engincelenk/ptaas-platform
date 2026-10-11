#!/bin/bash
# Interactive setup script — generates all required secret files under ./secrets/
# Run once before first production deployment:  bash infra/setup-secrets.sh

set -euo pipefail

SECRETS_DIR="$(dirname "$0")/../secrets"
mkdir -p "$SECRETS_DIR"

generate_hex() { openssl rand -hex "$1"; }
generate_b64() { openssl rand -base64 "$1" | tr -d '\n='; }

ask_or_generate() {
  local name="$1"
  local description="$2"
  local file="${SECRETS_DIR}/${name}.txt"
  local auto_value="${3:-}"

  if [[ -f "$file" ]]; then
    echo "  ✓ $name already exists — skipping"
    return
  fi

  if [[ -n "$auto_value" ]]; then
    echo "$auto_value" > "$file"
    echo "  ✓ $name generated"
  else
    echo ""
    echo "  → $description"
    read -rsp "  Enter value for $name (or press Enter to auto-generate): " val
    echo ""
    if [[ -z "$val" ]]; then
      echo "  Auto-generating $name..."
      echo "$(generate_hex 32)" > "$file"
    else
      echo "$val" > "$file"
    fi
    echo "  ✓ $name saved"
  fi

  chmod 600 "$file"
}

echo ""
echo "PTaaS Production Secret Setup"
echo "=============================="
echo ""

ask_or_generate "db_password"        "PostgreSQL password"             "$(generate_hex 24)"
ask_or_generate "jwt_secret"         "JWT signing secret (min 64 chars)" "$(generate_hex 64)"
ask_or_generate "aes_key"            "AES-256 encryption key (32 hex bytes)" "$(generate_hex 32)"
ask_or_generate "scanner_api_key"    "Internal scanner API key"         "$(generate_hex 32)"
ask_or_generate "encryption_key"     "Secondary encryption key"         "$(generate_hex 32)"
ask_or_generate "minio_root_password" "MinIO root password"             "$(generate_hex 20)"

echo ""
echo "  → Anthropic API key from https://console.anthropic.com"
ask_or_generate "anthropic_api_key"  "Anthropic API key (sk-ant-...)"   ""

echo ""
echo "=============================="
echo "All secrets written to ${SECRETS_DIR}/"
echo ""
echo "Next steps:"
echo "  1. Copy .env.production.example → .env and fill remaining values"
echo "  2. Place TLS cert + key at paths set in NGINX_SSL_CERT / NGINX_SSL_KEY"
echo "  3. Set CLOUDFLARE_TUNNEL_TOKEN in .env"
echo "  4. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo ""
