#!/usr/bin/env sh
set -eu

BASE_URL="${1:-}"

if [ -z "$BASE_URL" ]; then
  printf 'Usage: %s <base-url>\n' "$0" >&2
  printf 'Example: %s https://academy.example.com\n' "$0" >&2
  exit 1
fi

BASE_URL=$(printf '%s' "$BASE_URL" | sed 's#/*$##')
SMOKE_WEBSTUDIO_COURSE_SLUG="${SMOKE_WEBSTUDIO_COURSE_SLUG:-}"

check_get() {
  name="$1"
  path="$2"
  url="${BASE_URL}${path}"

  printf 'Checking %s: %s\n' "$name" "$url"
  curl -fsS --max-time 20 "$url" >/dev/null
}

fetch_text() {
  path="$1"
  url="${BASE_URL}${path}"
  curl -fsS --max-time 20 "$url"
}

detect_webstudio_course_slug() {
  payload=$(fetch_text "/api/public/courses?fields=slug")
  printf '%s' "$payload" | tr -d '\n' | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p'
}

check_get "Live health" "/api/health/live"
check_get "Ready health" "/api/health/ready"
check_get "Public root" "/"
check_get "Robots" "/robots.txt"
check_get "Sitemap" "/sitemap.xml"
check_get "Tilda health" "/api/tilda/health"
check_get "Webstudio public courses" "/api/public/courses"
check_get "Courses feed" "/api/courses-feed"
check_get "Tilda courses" "/api/tilda/courses"
check_get "Tilda helper asset" "/assets/tilda-course-fields.js"
check_get "Webstudio helper asset" "/assets/webstudio-course-fields.js"

if [ -z "$SMOKE_WEBSTUDIO_COURSE_SLUG" ]; then
  SMOKE_WEBSTUDIO_COURSE_SLUG=$(detect_webstudio_course_slug || true)
fi

if [ -n "$SMOKE_WEBSTUDIO_COURSE_SLUG" ]; then
  check_get "Webstudio single course" "/api/public/courses/${SMOKE_WEBSTUDIO_COURSE_SLUG}"
  check_get "Webstudio course SEO" "/api/public/seo/courses/${SMOKE_WEBSTUDIO_COURSE_SLUG}"
else
  printf 'Skipping Webstudio single course smoke-check: no slug provided or detected\n'
fi

printf 'Smoke check passed for %s\n' "$BASE_URL"
