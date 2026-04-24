# Webstudio VPS Deploy

Этот документ описывает поддерживаемый deployment path для сценария, где публичные страницы отдаются отдельным контейнером `Webstudio`, а `Strapi` остается backend, CMS и источником `/api/*`.

Актуальное текущее состояние проекта и общая архитектура зафиксированы в корневом [README.md](/Users/antonpancenko/Documents/academy/README.md).

## Что поднимается

- `postgres`
- `strapi`
- `webstudio`
- `caddy`

Файл compose:

- [docker-compose.webstudio-vps.yml](/Users/antonpancenko/Documents/academy/docker-compose.webstudio-vps.yml)

## Маршрутизация

Reverse proxy описан в [deploy/caddy/Caddyfile.webstudio](/Users/antonpancenko/Documents/academy/deploy/caddy/Caddyfile.webstudio).

Поддерживаемое правило маршрутизации:

- `/api/*`, `/admin/*`, `/uploads/*`, `/assets/*` и связанные Strapi-маршруты идут в `strapi`
- остальные публичные маршруты идут в `webstudio`

Это позволяет страницам `Webstudio` выполнять same-origin запросы к backend по путям вида `/api/...` без отдельного CORS-контура.

## Предусловия

- подготовлен `.env.prod` или другой env-файл с production-переменными;
- в директории [webstudio/](/Users/antonpancenko/Documents/academy/webstudio) находится экспорт `Webstudio`, содержащий production `Dockerfile`;
- либо задан `WEBSTUDIO_IMAGE` с уже собранным frontend-образом;
- DNS домена указывает на сервер, где будет запущен `caddy`.

## Обязательные env

Для этого deploy path должны быть заданы:

- `PUBLIC_URL`
- `ADMIN_URL`
- `CORS_ORIGIN`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `STRAPI_APP_KEYS`
- `STRAPI_API_TOKEN_SALT`
- `STRAPI_ADMIN_JWT_SECRET`
- `STRAPI_TRANSFER_TOKEN_SALT`
- `STRAPI_JWT_SECRET`
- `STRAPI_ENCRYPTION_KEY`
- `DOMAIN`
- `LETSENCRYPT_EMAIL`

Дополнительно поддерживаются:

- `DEPLOY_READY_URL`
- `DEPLOY_WAIT_READY_SECONDS`
- `DEPLOY_RUN_SMOKE_CHECK`
- `WEBSTUDIO_IMAGE`
- `SEO_STATIC_PATHS`
- `SEO_SITE_NAME`
- `SEO_TITLE_SUFFIX`
- `SEO_DEFAULT_DESCRIPTION`
- `SMOKE_WEBSTUDIO_COURSE_SLUG`

## Запуск

```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

Что делает скрипт:

- проверяет обязательные env;
- если задан `WEBSTUDIO_IMAGE`, использует его как источник frontend-контейнера;
- иначе проверяет наличие `webstudio/Dockerfile`;
- поднимает `postgres + strapi + webstudio + caddy`;
- ждет readiness по `/api/health/ready`;
- по умолчанию запускает smoke-check.

## Проверка

После запуска проверить:

- `/`
- `/api/health/live`
- `/api/health/ready`
- `/robots.txt`
- `/sitemap.xml`
- `/api/public/courses`
- `/api/public/seo/courses/{slug}`
- `/api/courses-feed`
- `/api/tilda/health`
- `/assets/tilda-course-fields.js`
- `/assets/webstudio-course-fields.js`
- `/api/public/courses/{slug}` через `SMOKE_WEBSTUDIO_COURSE_SLUG` или auto-discovery первого опубликованного slug

## SEO-артефакты

Для Webstudio-сценария `Caddy` направляет `/robots.txt` и `/sitemap.xml` в `Strapi`.

Единый источник SEO-метаданных для страниц курсов:

- `GET /api/public/seo/courses/{slug}`
- `GET /api/public/seo/courses/resolve?path=/course-page`

Этот payload должен использоваться при сборке страницы или server-side render в `Webstudio`, чтобы `title`, `description`, `canonical` и `Open Graph` не расходились с backend-данными курса.

`sitemap.xml` строится из:

- `PUBLIC_URL`
- путей из `SEO_STATIC_PATHS`
- `coursePath` опубликованных курсов

Для быстрой проверки можно использовать:

```bash
./deploy/scripts/smoke-check.sh https://your-domain.com
```

## Rollback и диагностика

Полезные команды:

```bash
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml ps
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f strapi
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f webstudio
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f caddy
```

Если нужно откатить последний неудачный релиз:

1. Найти предыдущий рабочий commit или предыдущий export `Webstudio`.
2. Вернуть в рабочее состояние директорию `webstudio/` и код backend.
3. Повторно запустить:

```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

Практическое правило:

- если менялся только frontend export, откат сводится к возврату предыдущего содержимого `webstudio/` и повторному deploy;
- если менялся и backend, откатывать нужно согласованную пару `backend + webstudio export`.

## Ограничения

- этот deployment path фиксирует только архитектурный и routing-контур;
- без реального export из `Webstudio` контейнер `webstudio` собрать нельзя.
