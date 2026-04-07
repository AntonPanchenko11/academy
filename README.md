# Academy Schedule App

Фронт + Strapi backend, запускаются в одном Docker-образе или через отдельный Webstudio runtime на VPS.

## Структура
- `index.html`, `assets/`, `frontend-db.js` — фронт расписания.
- `backend/strapi-app` — Strapi приложение.
- `Dockerfile.fullstack` — единый образ: Strapi + фронт.
- `docker-compose.prod.yml` — запуск `postgres + app`.
- `docker-compose.webstudio-vps.yml` — запуск `postgres + strapi + webstudio + caddy`.

## Как собирается Docker
- stage `deps` в [Dockerfile.fullstack](/Users/antonpancenko/Documents/academy/Dockerfile.fullstack) ставит npm-зависимости Strapi;
- stage `build` копирует backend и статический frontend в `public/`, затем выполняет `npm run build`;
- stage `runtime` собирает чистый production-образ и копирует только то, что нужно для запуска: `config/`, `database/`, `public/`, `src/`, `build/`, `node_modules/`, `package*.json`.

Такой runtime-слой не тащит лишние локальные файлы и не включает служебный мусор из рабочей директории.

## Модель Course
Сущность `Course` находится в:
- `backend/strapi-app/src/api/course/content-types/course/schema.json`

Поля:
- `title` — название курса
- `slug` — стабильный slug для Tilda и API
- `publish` — публикация на витрине
- `basePrice` — базовая цена курса в рублях
- `comment` — комментарий
- `date` — дата
- `waitlist` — лист ожидания
- `courseStatus` — статус курса
- `studyDays` — дни обучения
- `hours` — часы
- `educationDocument` — документ об образовании
- `courseLink` — ссылка на страницу курса

## Цены

Во фронтовых интеграциях и публичных feed'ах используется только итоговое поле `price`.

## Production / self-hosting

### 1) Требования
- Linux сервер
- Docker + Docker Compose plugin

### 2) Подготовка env
```bash
cd /path/to/academy
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
```

В `.env.prod` заполните:
- `PUBLIC_URL`, `ADMIN_URL`, `CORS_ORIGIN`
- `POSTGRES_PASSWORD`
- Strapi-секреты из вывода `generate-secrets.sh`

### 3) Запуск
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

### 3.1) Ограничение памяти на сервере
В `.env.prod` можно управлять ресурсами без правки compose-файлов:
- `NODE_MAX_OLD_SPACE_SIZE=384` — ограничивает heap процесса Node/Strapi;
- `STRAPI_MEM_LIMIT=768m` — верхняя граница памяти контейнера Strapi;
- `POSTGRES_MEM_LIMIT=512m` — верхняя граница памяти контейнера PostgreSQL;
- `DATABASE_POOL_MIN=0`, `DATABASE_POOL_MAX=4` — уменьшенный пул подключений к БД;
- `DOCKER_LOG_MAX_SIZE=10m`, `DOCKER_LOG_MAX_FILE=3` — ротация логов, чтобы не разрастался диск.

Для маленького VPS это обычно достаточно, чтобы приложение не раздувало RAM и не накапливало старые docker-логи.

### 4) Проверка
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f strapi
```

## Production / Selectel VPS

Этот режим нужен для обычного remote deployment на VPS, когда frontend проекта остаётся встроенным в Strapi через `Dockerfile.fullstack`, а наружу публикуются только `80/443` через Caddy.

Файлы решения:
- [docker-compose.selectel.yml](/Users/antonpancenko/Documents/academy/docker-compose.selectel.yml)
- [deploy/caddy/Caddyfile](/Users/antonpancenko/Documents/academy/deploy/caddy/Caddyfile)
- [deploy/scripts/deploy-selectel.sh](/Users/antonpancenko/Documents/academy/deploy/scripts/deploy-selectel.sh)
- [deploy/SELECTEL_VPS.md](/Users/antonpancenko/Documents/academy/deploy/SELECTEL_VPS.md)
- [deploy/SELECTEL_CHECKLIST.md](/Users/antonpancenko/Documents/academy/deploy/SELECTEL_CHECKLIST.md)

Ключевая логика маршрутизации:
- `80/443` принимает `caddy`
- весь домен проксируется в `strapi`
- `strapi` отдает frontend, `/admin`, `/api/*`, `/uploads/*`, `/assets/*`

Быстрый запуск:
```bash
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
./deploy/scripts/deploy-selectel.sh .env.prod
```

## Production / VPS через Webstudio CLI

Этот режим нужен, когда основной frontend собирается через Webstudio CLI, а backend проекта продолжает обслуживать API, админку, uploads и Tilda course-assets.

Файлы решения:
- [docker-compose.webstudio-vps.yml](/Users/antonpancenko/Documents/academy/docker-compose.webstudio-vps.yml)
- [deploy/caddy/Caddyfile.webstudio](/Users/antonpancenko/Documents/academy/deploy/caddy/Caddyfile.webstudio)
- [deploy/scripts/deploy-webstudio-vps.sh](/Users/antonpancenko/Documents/academy/deploy/scripts/deploy-webstudio-vps.sh)
- [deploy/WEBSTUDIO_VPS.md](/Users/antonpancenko/Documents/academy/deploy/WEBSTUDIO_VPS.md)
- [deploy/SELECTEL_CHECKLIST.md](/Users/antonpancenko/Documents/academy/deploy/SELECTEL_CHECKLIST.md)

Ключевая логика маршрутизации:
- `/api/*`, `/admin/*`, `/uploads/*`, `/assets/*` -> `strapi`
- остальные frontend route'ы -> `webstudio`

Быстрый запуск:
```bash
webstudio build --template docker
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

## Маршруты
- Фронт: `${PUBLIC_URL}`
- Админка Strapi: `${ADMIN_URL}`
- API: `${PUBLIC_URL}/api`
- Liveness: `GET ${PUBLIC_URL}/api/health/live`
- Readiness: `GET ${PUBLIC_URL}/api/health/ready`
- Публичный feed для фронта: `${PUBLIC_URL}/api/courses-feed`
- Проверка Tilda course API: `GET ${PUBLIC_URL}/api/tilda/health`
- Список курсов для Tilda: `GET ${PUBLIC_URL}/api/tilda/courses`
- Один курс для Tilda: `GET ${PUBLIC_URL}/api/tilda/courses/{slug|id|documentId}`
- Резолв курса по URL/path страницы: `GET ${PUBLIC_URL}/api/tilda/courses/resolve?path=/act`

## Tilda: course fields

Подробное описание интеграции: [deploy/TILDA_INTEGRATION.md](/Users/antonpancenko/Documents/academy/deploy/TILDA_INTEGRATION.md)

Что поддерживается:
- подстановка полей курса в Tilda через `/assets/tilda-course-fields.js`

Пример T123-блока:

```html
<div
  class="js-tilda-course-fields"
  data-api-base="https://your-domain.com"
  data-course-slug="act"
  data-course-fields-extra="price"
>
  <h1 data-course-field="title"></h1>
  <div data-course-field="price"></div>
  <div data-course-field="dateLabel" data-course-hide-empty="true"></div>
  <div data-course-field="studyDays" data-course-hide-empty="true"></div>
  <a
    data-course-field="courseLink"
    data-course-attr="href"
    href="#"
  >
    Перейти к курсу
  </a>
</div>
<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>
```

`data-api-base` можно не указывать, если helper подключается напрямую с backend-домена:
- `<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>`
- тогда `apiBase` будет автоматически взят из `src` скрипта

Можно задавать идентификатор курса один раз на всю Tilda-страницу:
- на `body`, `html` или любой общий контейнер через `data-course-slug`, `data-course-id`, `data-course-document-id`, `data-course-url`, `data-course-path`
- или через `window.ACADEMY_TILDA_COURSE = { apiBase, slug|id|documentId|url|path }`

Если страница Tilda не совпадает по URL с `courseLink`, можно задать:
- `data-course-slug="act"`
- `data-course-id="12"`
- `data-course-document-id="abc123"`
- `data-course-url="https://modern-psy.ru/act"`
- `data-course-path="/act"`

Для запроса полей, которые не нужно вставлять напрямую в DOM:
- `data-course-fields-extra="price"`
- или `data-course-request-field="price"` на скрытом узле

Поддерживаемые public fields:
- `title`
- `comment`
- `courseStatus`
- `date`
- `day`
- `month`
- `monthLabel`
- `weekdayShort`
- `dateLabel`
- `studyDays`
- `hours`
- `hoursLabel`
- `price`
- `educationDocument`
- `courseLink`
- `coursePath`
- `slug`
