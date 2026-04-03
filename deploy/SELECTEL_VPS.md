# Selectel VPS

Этот сценарий нужен для обычного production-развертывания проекта на удалённом сервере Selectel без отдельного Webstudio runtime.

## Состав стека

- `postgres` — база данных
- `strapi` — API, админка, Tilda endpoints и встроенный frontend из `Dockerfile.fullstack`
- `caddy` — reverse proxy и TLS termination

Основной compose-файл: [docker-compose.selectel.yml](/Users/antonpancenko/Documents/academy/docker-compose.selectel.yml)

## Как работает маршрутизация

Конфиг прокси лежит в [deploy/caddy/Caddyfile](/Users/antonpancenko/Documents/academy/deploy/caddy/Caddyfile).

Внешний трафик принимает только `caddy`:
- `80` -> HTTP challenge / redirect / первичный вход
- `443` -> HTTPS

Дальше весь трафик проксируется в `strapi:1337`, который отдает:
- `/` и frontend страницы
- `/admin`
- `/api/*`
- `/uploads/*`
- `/assets/*`

## Подготовка сервера

1. Создать VPS в Selectel с Linux.
2. Настроить DNS так, чтобы домен указывал на публичный IP сервера.
3. Установить Docker и Docker Compose plugin.
4. Открыть наружу только порты `80` и `443`.
5. Склонировать проект на сервер.

## Подготовка env

```bash
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
```

Заполните в `.env.prod`:

```dotenv
PUBLIC_URL=https://academy.example.com
ADMIN_URL=https://academy.example.com/admin
CORS_ORIGIN=https://academy.example.com
POSTGRES_DB=academy
POSTGRES_USER=strapi
POSTGRES_PASSWORD=strong_password
DOMAIN=academy.example.com
LETSENCRYPT_EMAIL=ops@academy.example.com
```

И вставьте все `STRAPI_*` секреты из вывода `generate-secrets.sh`.

## Запуск

```bash
chmod +x ./deploy/scripts/deploy-selectel.sh
./deploy/scripts/deploy-selectel.sh .env.prod
```

Скрипт:
- проверяет наличие `.env` файла
- валидирует обязательные production-переменные
- запускает `docker compose --env-file ... -f docker-compose.selectel.yml up -d --build`

## Проверка

```bash
docker compose --env-file .env.prod -f docker-compose.selectel.yml ps
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f caddy
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f strapi
```

Проверьте:
- `https://your-domain.com`
- `https://your-domain.com/admin`
- `https://your-domain.com/api/health/live`
- `https://your-domain.com/api/health/ready`
- `https://your-domain.com/api/tilda/health`
- `https://your-domain.com/assets/tilda-course-fields.js`

## Обновление

После изменения кода на сервере:

```bash
./deploy/scripts/deploy-selectel.sh .env.prod
```

## Что хранить постоянно

- volume `pg-data`
- volume `strapi-uploads`
- volume `caddy-data`
- volume `caddy-config`

## Бэкапы

Минимум:
- регулярный `pg_dump`
- отдельная копия `strapi-uploads`
- хранение бэкапов вне VPS
