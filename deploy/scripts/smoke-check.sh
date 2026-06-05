#!/usr/bin/env sh
set -eu

BASE_URL="${1:-}"

if [ -z "$BASE_URL" ]; then
  printf 'Usage: %s <base-url>\n' "$0" >&2
  printf 'Example: %s https://academy.example.com\n' "$0" >&2
  exit 1
fi

BASE_URL=$(printf '%s' "$BASE_URL" | sed 's#/*$##')

check_get() {
  name="$1"
  path="$2"
  url="${BASE_URL}${path}"

  printf 'Checking %s: %s\n' "$name" "$url"
  curl -fsS --max-time 20 "$url" >/dev/null
}

check_redirect() {
  name="$1"
  path="$2"
  expected_location="$3"
  url="${BASE_URL}${path}"

  printf 'Checking %s: %s -> %s\n' "$name" "$url" "$expected_location"
  location=$(curl -fsS -I --max-time 20 "$url" | awk 'BEGIN { IGNORECASE = 1 } /^Location:/ { print $2 }' | tr -d '\r')

  if [ "$location" != "$expected_location" ]; then
    printf 'Unexpected redirect location for %s: got "%s", expected "%s"\n' "$name" "$location" "$expected_location" >&2
    exit 1
  fi
}

check_get "Live health" "/api/health/live"
check_get "Ready health" "/api/health/ready"
check_redirect "Public root redirect" "/" "/timetable"
check_get "Timetable page" "/timetable"
check_get "Robots" "/robots.txt"
check_get "Sitemap" "/sitemap.xml"
check_get "Tilda health" "/api/tilda/health"
check_get "Courses feed" "/api/courses-feed"
check_get "Tilda courses" "/api/tilda/courses"
check_get "Tilda helper asset" "/assets/tilda-course-fields.js"
check_get "Tilda lead gateway asset" "/assets/tilda-lead-gateway.js"

printf 'Smoke check passed for %s\n' "$BASE_URL"
