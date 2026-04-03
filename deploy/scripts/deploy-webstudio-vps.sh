#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-.env.prod}"
COMPOSE_FILE="docker-compose.webstudio-vps.yml"
WEBSTUDIO_DIR="${WEBSTUDIO_DIR:-./webstudio}"

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing env file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$WEBSTUDIO_DIR/Dockerfile" ]; then
  printf 'Missing %s/Dockerfile\n' "$WEBSTUDIO_DIR" >&2
  printf 'Export the frontend with "webstudio build --template docker" and copy the result into %s\n' "$WEBSTUDIO_DIR" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
