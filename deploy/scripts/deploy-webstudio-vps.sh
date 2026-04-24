#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-.env.prod}"
COMPOSE_FILE="docker-compose.webstudio-vps.yml"
WEBSTUDIO_DIR="${WEBSTUDIO_DIR:-./webstudio}"
WEBSTUDIO_IMAGE="${WEBSTUDIO_IMAGE:-}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing env file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

require_var() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  if [ -z "$var_value" ]; then
    printf 'Missing required env var in %s: %s\n' "$ENV_FILE" "$var_name" >&2
    exit 1
  fi
}

if [ -z "$WEBSTUDIO_IMAGE" ] && [ ! -f "$WEBSTUDIO_DIR/Dockerfile" ]; then
  printf 'Missing %s/Dockerfile\n' "$WEBSTUDIO_DIR" >&2
  printf 'Export the frontend from Webstudio as a Docker-ready release and copy the result into %s\n' "$WEBSTUDIO_DIR" >&2
  printf 'Or set WEBSTUDIO_IMAGE to deploy a prebuilt frontend image.\n' >&2
  exit 1
fi

require_var PUBLIC_URL
require_var ADMIN_URL
require_var CORS_ORIGIN
require_var POSTGRES_DB
require_var POSTGRES_USER
require_var POSTGRES_PASSWORD
require_var STRAPI_APP_KEYS
require_var STRAPI_API_TOKEN_SALT
require_var STRAPI_ADMIN_JWT_SECRET
require_var STRAPI_TRANSFER_TOKEN_SALT
require_var STRAPI_JWT_SECRET
require_var STRAPI_ENCRYPTION_KEY
require_var DOMAIN
require_var LETSENCRYPT_EMAIL

DEPLOY_READY_URL="${DEPLOY_READY_URL:-${PUBLIC_URL%/}/api/health/ready}"
DEPLOY_WAIT_READY_SECONDS="${DEPLOY_WAIT_READY_SECONDS:-180}"
DEPLOY_RUN_SMOKE_CHECK="${DEPLOY_RUN_SMOKE_CHECK:-true}"
WEBSTUDIO_COMPOSE_OVERRIDE=""

wait_for_ready() {
  elapsed=0

  while [ "$elapsed" -lt "$DEPLOY_WAIT_READY_SECONDS" ]; do
    if curl -fsS --max-time 10 "$DEPLOY_READY_URL" >/dev/null 2>&1; then
      printf 'Ready check passed: %s\n' "$DEPLOY_READY_URL"
      return 0
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  printf 'Ready check timed out after %ss: %s\n' "$DEPLOY_WAIT_READY_SECONDS" "$DEPLOY_READY_URL" >&2
  return 1
}

set -- --env-file "$ENV_FILE" -f "$COMPOSE_FILE"

if [ -n "$WEBSTUDIO_IMAGE" ]; then
  WEBSTUDIO_COMPOSE_OVERRIDE=$(mktemp "${TMPDIR:-/tmp}/academy-webstudio-compose.XXXXXX.yml")
  trap 'rm -f "$WEBSTUDIO_COMPOSE_OVERRIDE"' EXIT HUP INT TERM
  cat > "$WEBSTUDIO_COMPOSE_OVERRIDE" <<EOF
services:
  webstudio:
    image: ${WEBSTUDIO_IMAGE}
    build: null
EOF
  set -- "$@" -f "$WEBSTUDIO_COMPOSE_OVERRIDE"
fi

docker compose "$@" up -d --build

wait_for_ready

if [ "$DEPLOY_RUN_SMOKE_CHECK" = "true" ]; then
  "$SCRIPT_DIR/smoke-check.sh" "$PUBLIC_URL"
fi
