#!/usr/bin/env sh
set -eu

rand() {
  openssl rand -base64 32 | tr -d '\n'
}

printf 'STRAPI_APP_KEYS=%s,%s,%s,%s\n' "$(rand)" "$(rand)" "$(rand)" "$(rand)"
printf 'STRAPI_API_TOKEN_SALT=%s\n' "$(rand)"
printf 'STRAPI_ADMIN_JWT_SECRET=%s\n' "$(rand)"
printf 'STRAPI_TRANSFER_TOKEN_SALT=%s\n' "$(rand)"
printf 'STRAPI_JWT_SECRET=%s\n' "$(rand)"
printf 'STRAPI_ENCRYPTION_KEY=%s\n' "$(rand)"
