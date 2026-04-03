# Webstudio CLI на VPS

Этот сценарий добавляет в проект отдельный production-режим, где frontend собирается через Webstudio CLI, а backend проекта продолжает обслуживать API, админку, uploads и Tilda course-assets.

## Состав стека

- `webstudio` — frontend runtime после `webstudio build --template docker`
- `strapi` — API, админка, `/uploads` и `/assets`
- `postgres` — база данных
- `caddy` — reverse proxy и TLS termination

Основной compose-файл: [docker-compose.webstudio-vps.yml](/Users/antonpancenko/Documents/academy/docker-compose.webstudio-vps.yml)

## Как работает маршрутизация

Конфиг прокси лежит в [deploy/caddy/Caddyfile.webstudio](/Users/antonpancenko/Documents/academy/deploy/caddy/Caddyfile.webstudio).

Маршруты:
- `/` и frontend routes -> `webstudio:3000`
- `/api/*` -> `strapi:1337`
- `/admin/*` -> `strapi:1337`
- `/uploads/*` -> `strapi:1337`
- `/assets/*` -> `strapi:1337`

Маршрут `/assets/*` нужен для Tilda-интеграций, потому что именно отсюда отдается:
- `tilda-course-fields.js`

## Подготовка Webstudio export

Внутри Webstudio-проекта:

```bash
webstudio build --template docker
```

Результат экспорта нужно скопировать в каталог:

```bash
./webstudio
```

Ожидаемый минимум:
- `webstudio/Dockerfile`
- `webstudio/package.json`
- `webstudio/build/`

## Подготовка env

```bash
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
```

Заполните:

```dotenv
PUBLIC_URL=https://academy.example.com
ADMIN_URL=https://academy.example.com/admin
CORS_ORIGIN=https://academy.example.com
POSTGRES_PASSWORD=strong_password
DOMAIN=academy.example.com
LETSENCRYPT_EMAIL=ops@academy.example.com
```

И добавьте Strapi secrets из `generate-secrets.sh`.

## Запуск

```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

Скрипт:
- проверяет env-файл
- проверяет `webstudio/Dockerfile`
- запускает `docker compose --env-file ... -f docker-compose.webstudio-vps.yml up -d --build`

## Проверка

```bash
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml ps
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f caddy
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f strapi
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f webstudio
```

Проверьте:
- `https://your-domain.com`
- `https://your-domain.com/admin`
- `https://your-domain.com/api/health/live`
- `https://your-domain.com/api/health/ready`
- `https://your-domain.com/api/tilda/health`
- `https://your-domain.com/assets/tilda-course-fields.js`

## Обновление

1. Повторно соберите frontend:
```bash
webstudio build --template docker
```
2. Обновите `./webstudio` на VPS.
3. Перезапустите стек:
```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

## Роль этого решения в проекте

Оно позволяет:
- держать Webstudio frontend отдельным runtime
- не переносить Tilda course API из проекта
- обслуживать Tilda-страницы и основной frontend через один домен и один reverse proxy
