#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-.env.prod}"
COMPOSE_FILE="docker-compose.selectel.yml"

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

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
