# Backend (Strapi)

## Dev режим
```bash
cd backend
docker compose up -d
```

## Production режим (единый образ фронт+бэк)
Используйте корневые файлы:
- `Dockerfile.fullstack`
- `docker-compose.prod.yml`

## Production режим на Selectel VPS

Для удаленного сервера с TLS и reverse proxy используйте:
- `docker-compose.selectel.yml`
- `deploy/scripts/deploy-selectel.sh`
- `deploy/SELECTEL_VPS.md`

## Production режим через Webstudio CLI на VPS

Если frontend экспортируется из Webstudio CLI как отдельный Docker runtime, используйте:
- `docker-compose.webstudio-vps.yml`
- `deploy/scripts/deploy-webstudio-vps.sh`
- `deploy/WEBSTUDIO_VPS.md`

## Course API для фронта
- `GET /api/courses-feed` — отдает курсы из БД, отфильтрованные по `publish = true`.

## Health API
- `GET /api/health/live` — liveness probe для контейнера приложения.
- `GET /api/health/ready` — readiness probe c проверкой доступа к БД.

## Course API для Tilda
- `GET /api/tilda/courses` — список public-полей курсов для Tilda.
- `GET /api/tilda/courses/{slug|id|documentId}` — один курс по удобному идентификатору.
- `GET /api/tilda/courses/resolve?path=/act` — находит курс по URL/path Tilda-страницы.
- `GET /api/tilda/health` — health endpoint для публичного Tilda course API.

Поддерживаются query-параметры:
- `fields=title,price,dateLabel` — вернуть только нужные поля.
- `waitlist=true|false` — фильтр для списка.
- `search=...` — поиск по public-полям.
- `includeUnpublished=true` — включить неопубликованные курсы.

## Pricing Settings
- В Strapi добавлен singleton `Pricing Settings` с repeatable-списком `scheduledIncreases`.
- Каждый элемент хранит дату и процент глобального повышения.
- Повышение применяется ко всем курсам прямо в БД после наступления даты.
- В `Course` добавлены поля `basePrice`, `discountPercent`, `discountedPrice`.
- Поле `price` теперь поддерживается backend'ом автоматически и остается совместимым с текущим фронтом.
