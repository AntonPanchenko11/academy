# Academy Schedule App

Единый источник правды по проекту находится в этом `README.md`.

Если информация из других markdown-файлов конфликтует с этим документом, правильной считается информация отсюда.

## Что это за проект

Проект обслуживает две публичные поверхности рендеринга и админку:

1. Страница расписания "Расписание обучения и мероприятий в Академии".
2. Страницы на Tilda, которые получают данные отдельного курса.
3. Админка Strapi, через которую администратор управляет курсами, скидками и запланированными изменениями цен.

Текущая целевая архитектура:

- `backend/strapi-app` — единственный backend, CMS и API-источник данных.
- `index.html` + `frontend-db.js` + `assets/` — встроенная страница расписания, которую отдает сам Strapi.
- `/api/tilda/*` + `/assets/tilda-course-fields.js` — публичный API и helper для Tilda.
- `/admin` — обязательная operational surface для контент-администратора.

Production-домены:

- основной домен проекта и backend/API: `https://dbmpa.ru/`;
- страницы курсов на Tilda: `https://modern-psy.ru/`;
- Tilda-страницы запрашивают поля курсов с `https://dbmpa.ru/` по явному `slug` курса.

## Что уже реализовано

- `Strapi` зафиксирован как единственный backend.
- Bootstrap Strapi разрезан на отдельные server/bootstrap-модули; `src/index.js` сведен к orchestration-слою.
- Public DTO курса унифицирован для страницы расписания и Tilda API.
- Legacy aliases `priceIncreases` и `nextPriceIncrease` удалены из публичного DTO.
- `frontend-db.js` упрощен до UI-слоя `DTO -> render`.
- `assets/tilda-course-fields.js` стабилизирован: понятные состояния, retry после временных ошибок, предсказуемые события и упрощенный lifecycle.
- Применение `Course Price Change` переведено на транзакционный батч-сценарий.
- Runtime maintenance убран из обычного boot-пути.
- Regression-набор переведен на явный SQLite seed fixture.
- Локальный quality gate и GitHub Actions CI синхронизированы через `npm run test:ci`.
- Канонический production path зафиксирован через `docker-compose.selectel.yml` и `deploy-selectel.sh`.

## Основные функции проекта

### 1. Страница расписания

Встроенная страница расписания:

- доступна по маршруту `/timetable`;
- остальные публичные page routes редиректятся на `/timetable`;
- загружает данные только из `GET /api/courses-feed`;
- не пересчитывает цены, скидки и derived date fields на клиенте;
- делит курсы на обычные и `waitlist`;
- группирует курсы по месяцам;
- показывает predictable loading / empty / error states.

Файлы:

- `index.html`
- `frontend-db.js`
- `assets/`

### 2. Tilda-интеграция

Проект поддерживает только публичное чтение `Course` для Tilda-страниц.

Production-контракт:

- Tilda-страницы опубликованы на `https://modern-psy.ru/`;
- backend/API и helper загружаются с `https://dbmpa.ru/`;
- каждая Tilda-страница должна задавать `data-course-slug`, по которому helper получает поля курса.

Есть:

- `GET /api/tilda/health`
- `GET /api/tilda/courses`
- `GET /api/tilda/courses/:identifier`
- `GET /api/tilda/courses/resolve?path=/course-page`
- `/assets/tilda-course-fields.js`

Helper:

- сам определяет `apiBase`;
- находит курс по `id`, `documentId`, `slug`, `url`, `path` или `title`;
- подставляет поля курса в DOM;
- выставляет состояние загрузки на root-элемент;
- dispatch'ит события для интегратора.

### 3. Админка Strapi

Через `/admin` администратор должен стабильно уметь:

- создавать, редактировать и удалять `Course`;
- создавать, редактировать и удалять `Discount`;
- создавать, редактировать и удалять `Course Price Change`.

Это обязательный рабочий сценарий проекта, который не должен ломаться при рефакторингах.

## Сущности

### Course

Основные поля:

- `title`
- `slug`
- `publish`
- `basePrice`
- `comment`
- `date`
- `waitlist`
- `courseStatus`
- `studyDays`
- `hours`
- `educationDocument`
- `courseLink`
- `catalogImg`
- `heroImg`

### Discount

Основные поля:

- `title`
- `percent`
- `active`
- `courses`
- `comment`

### Course Price Change

Основные поля:

- `course`
- `effectiveAt`
- `targetBasePrice`
- `name`
- `comment`

## Доменные правила цен и скидок

В проекте зафиксированы такие инварианты:

- `Course` не должен дублироваться по канонической комбинации ссылки, даты/названия и `waitlist`.
- Для одного курса не допускаются два `Course Price Change` на один и тот же `effectiveAt`.
- Последовательность `Course Price Change` для курса должна быть строго возрастающей по `targetBasePrice`.
- Новый `Course Price Change` должен быть больше предыдущей цены и меньше следующей уже запланированной цены.
- `Course Price Change` можно создать в прошлом не более чем на 24 часа назад.
- Просроченные `Course Price Change` применяются батчем и атомарно.
- `Discount.percent` должен быть целым числом от 1 до 100.
- На публичную цену влияет только активная скидка.

Практическая оговорка:

- из-за текущей Strapi-модели связи гарантия уникальности `(course, effectiveAt)` обеспечивается lifecycle-валидацией и integrity regression, а не переносимым cross-DB schema constraint.

## Public API

### Health

- `GET /api/health/live`
- `GET /api/health/ready`
- `GET /api/tilda/health`
- `GET /robots.txt`
- `GET /sitemap.xml`

### Feed для страницы расписания

- `GET /api/courses-feed`

Возвращает опубликованные курсы в публичном DTO.

### Tilda API

- `GET /api/tilda/courses`
- `GET /api/tilda/courses/{slug|id|documentId}`
- `GET /api/tilda/courses/resolve?path=/act`

Поддерживаемые query-параметры:

- `fields=title,price,dateLabel`
- `waitlist=true|false`
- `search=...`
- `includeUnpublished=true`

## Public Course DTO

Публичный API проекта опирается на единый сериализованный DTO курса.

Базовые поля DTO:

- `id`
- `documentId`
- `slug`
- `title`
- `comment`
- `publish`
- `waitlist`
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
- `basePrice`
- `discountPercent`
- `price`
- `activeDiscount`
- `priceChanges`
- `nextPriceChange`
- `educationDocument`
- `courseLink`
- `catalogImg`
- `heroImg`
- `coursePath`

Правило проекта:

- вычисляемые поля курса формируются на backend;
- клиенты не должны повторно реализовывать бизнес-логику цены, скидки и derived date fields.

### Минимальный набор для страницы расписания

- `title`
- `comment`
- `publish`
- `waitlist`
- `courseStatus`
- `date`
- `day`
- `dateLabel`
- `studyDays`
- `hoursLabel`
- `price`
- `educationDocument`
- `courseLink`
- `catalogImg`
- `heroImg`

### Минимальный набор для Tilda helper

- `id`
- `documentId`
- `slug`
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
- `catalogImg`
- `heroImg`
- `coursePath`
- `nextPriceChange`

Пример:

```json
{
  "ok": true,
  "data": {
    "title": "Актерское мастерство",
    "price": 15000,
    "dateLabel": "Мая, пн"
  }
}
```

## Как оформить блок в Tilda

Проектный helper работает только с `Course`.

Базовый HTML-блок:

```html
<div
  class="js-tilda-course-fields"
  data-api-base="https://dbmpa.ru"
  data-course-slug="act"
  data-course-fields-extra="price,nextPriceChange"
>
  <h1 data-course-field="title"></h1>
  <div data-course-field="price"></div>
  <div data-course-field="dateLabel" data-course-hide-empty="true"></div>
  <div data-course-field="studyDays" data-course-hide-empty="true"></div>
  <div data-course-field="hoursLabel" data-course-hide-empty="true"></div>
  <img
    data-course-field="catalogImg"
    data-course-attr="src"
    data-course-hide-empty="true"
    alt=""
  >
  <a data-course-field="courseLink" data-course-attr="href" href="#">
    Перейти к курсу
  </a>
</div>
<script src="https://dbmpa.ru/assets/tilda-course-fields.js"></script>
```

Что произойдет:

- helper загрузится с backend-домена;
- запросит курс по `slug`;
- соберет `fields` из нужных DOM-узлов;
- подставит значения в размеченные элементы.

### Способы идентификации курса

Можно задать один основной идентификатор:

- `data-course-id="12"`
- `data-course-document-id="abc123"`
- `data-course-slug="act"`
- `data-course-url="https://site.ru/act"`
- `data-course-path="/act"`
- `data-course-title="ACT"`

Приоритет:

1. `data-course-id`
2. `data-course-document-id`
3. `data-course-slug`
4. `data-course-url`
5. `data-course-path`
6. `data-course-title`

Практическое правило:

- для production-страниц на `https://modern-psy.ru/` нужно задавать явный `data-course-slug`;
- `data-api-base` и `script src` должны указывать на `https://dbmpa.ru/`.

### Поддерживаемые root-атрибуты helper

- `data-api-base`
- `data-course-id`
- `data-course-document-id`
- `data-course-slug`
- `data-course-url`
- `data-course-path`
- `data-course-title`
- `data-course-fields-extra`

### Поддерживаемые атрибуты на field-узлах

- `data-course-field`
- `data-course-attr`
- `data-course-default`
- `data-course-hide-empty`
- `data-course-request-field`

### Если не хочешь явно задавать slug

Если URL Tilda-страницы совпадает с `courseLink`, helper может сам вызвать:

- `GET /api/tilda/courses/resolve?path=${window.location.pathname}`

Но это надежно только если URL страницы и `courseLink` действительно совпадают.

### Состояния helper

На root helper выставляет:

- `data-course-state="idle"`
- `data-course-state="loading"`
- `data-course-state="success"`
- `data-course-state="not-found"`
- `data-course-state="error"`

### События helper

- `academy:tilda:course-loading`
- `academy:tilda:course-data`
- `academy:tilda:course-not-found`
- `academy:tilda:course-error`

Во всех событиях `detail.request` содержит итоговый запрос helper'а.

В `academy:tilda:course-data` дополнительно приходит `detail.course`.

## SEO-артефакты

- `/robots.txt`
- `/sitemap.xml`

`robots.txt` указывает на sitemap текущего `PUBLIC_URL`.

`sitemap.xml` собирается из:

- корня сайта `/`
- путей из `SEO_STATIC_PATHS`
- `coursePath` всех опубликованных курсов

Практическое правило:

- `SEO_STATIC_PATHS` должен содержать только canonical публичные маршруты сайта;
- если canonical URL расписания — `/timetable`, добавить `/timetable` в `SEO_STATIC_PATHS`;
- страницы курсов должны иметь стабильный canonical path, совпадающий с `coursePath`;
- основной контент SEO-важных страниц должен быть доступен в HTML, а не только после поздней client-side подгрузки.

## Репозиторий и структура

- `backend/strapi-app` — Strapi приложение.
- `index.html`, `frontend-db.js`, `assets/` — встроенная страница расписания.
- `Dockerfile.fullstack` — единый runtime.
- `docker-compose.selectel.yml` — канонический production deploy.
- `docker-compose.prod.yml` — secondary self-hosting сценарий.
- `deploy/` — shell-скрипты и deploy-артефакты.
- `backend/nest-bff`, `backend/strapi-content-types` — не участвуют в текущем runtime.

## Как собирается Docker

- stage `deps` в `Dockerfile.fullstack` ставит npm-зависимости Strapi;
- stage `build` копирует backend и статический frontend в `public/`, затем выполняет `npm run build`;
- stage `runtime` собирает production-образ и копирует только то, что нужно для запуска.

## Канонический локальный запуск

```bash
cd backend/strapi-app
cp .env.example .env
npm ci
npm run dev
```

Что дает этот режим:

- Strapi backend и admin на одном локальном runtime;
- встроенную страницу расписания из `public/`;
- публичные `/api/*`;
- Tilda helper на `/assets/tilda-course-fields.js`.

## Quality gate

Основная команда локальной проверки:

```bash
cd backend/strapi-app
npm run build
npm run test:ci
```

Regression-набор использует явный SQLite seed fixture:

- `backend/strapi-app/scripts/fixtures/base-seed.db`

## Maintenance

Maintenance не является частью обычного startup.

Явные команды:

- `npm run maintenance:bootstrap`
- `npm run maintenance:migrate-course-base-price`
- `npm run maintenance:migrate-course-image-fields`
- `npm run maintenance:sync-content-manager-config`

### Правило для миграций БД

Для этого проекта миграция БД должна быть простой и явной.

- Если задача сводится к добавлению нового nullable-поля или обновлению Strapi schema без переноса старых данных, отдельная migration обычно не нужна: достаточно обновить schema, DTO и регрессии.
- Migration нужна только когда требуется backfill, перенос данных, cleanup legacy-полей или исправление уже существующих записей.
- Migration должна быть идемпотентной: повторный запуск не должен портить данные и должен возвращать `skipped` или корректный итог.
- Логику migration держать в `src/utils/*`, а запуск делать отдельным script в `scripts/`.
- Перед изменением данных нужно проверить применимость шага: client, наличие таблицы/колонки, формат старых данных.
- Изменения должны быть точечными: не смешивать в одной migration schema change, data backfill и несвязанный cleanup.
- Опасные или необратимые действия вроде `DROP COLUMN`, массового `DELETE` или переименования с потерей данных не делать без отдельного явного запроса.
- Результат migration должен быть машинно-читаемым и коротким, как в существующих maintenance scripts: `{ skipped, reason }` или `{ skipped: false, updatedRows }`.

Канонический flow:

1. Сначала изменить Strapi schema и runtime-код.
2. Если нужны изменения существующих данных, добавить идемпотентную функцию migration по образцу `migrateCourseBasePrice`.
3. Под migration добавить отдельный script запуска в `backend/strapi-app/scripts/`.
4. Добавить regression, который проверяет состояние до и после migration.
5. Запускать migration только явной maintenance-командой, а не в обычном startup.

Для наших типовых задач агент должен предпочитать минимальный безопасный путь:

- новое необязательное поле: без migration;
- новое поле с обязательным backfill: migration;
- удаление legacy-поля: сначала перестать его использовать, потом отдельной задачей cleanup.

## Обязательные env для runtime и CI

Минимальный ожидаемый набор:

- `HOST`
- `PORT`
- `APP_KEYS`
- `API_TOKEN_SALT`
- `ADMIN_JWT_SECRET`
- `TRANSFER_TOKEN_SALT`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

Для SQLite/local script flow:

- `DATABASE_CLIENT=sqlite`
- `DATABASE_FILENAME`

Для Postgres/runtime:

- `DATABASE_CLIENT=postgres`
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_NAME`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_SSL`

Для admin session config:

- `ADMIN_ACCESS_TOKEN_LIFESPAN`
- `ADMIN_MAX_REFRESH_TOKEN_LIFESPAN`
- `ADMIN_IDLE_REFRESH_TOKEN_LIFESPAN`
- `ADMIN_MAX_SESSION_LIFESPAN`
- `ADMIN_IDLE_SESSION_LIFESPAN`

## Канонический production deploy

Production-директория проекта на сервере: `/opt/academy`.

Основной production flow:

1. Подготовить `.env.prod`
2. Сгенерировать секреты
3. Запустить deploy script

Команды:

```bash
cd /opt/academy
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
./deploy/scripts/deploy-selectel.sh .env.prod
```

В этом режиме:

- frontend расписания встроен в Strapi;
- наружу публикуются только `80/443` через `caddy`;
- `www.{DOMAIN}` редиректит на основной `DOMAIN` с сохранением пути;
- deploy ждет readiness по `/api/health/ready`;
- по умолчанию запускается smoke-check.

### Что должно быть в `.env.prod`

Минимум:

- `PUBLIC_URL`
- `ADMIN_URL`
- `CORS_ORIGIN`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DOMAIN`
- `LETSENCRYPT_EMAIL`
- все `STRAPI_*` секреты

Пример:

```dotenv
PUBLIC_URL=https://dbmpa.ru
ADMIN_URL=https://dbmpa.ru/admin
CORS_ORIGIN=https://dbmpa.ru,https://modern-psy.ru
POSTGRES_DB=academy
POSTGRES_USER=strapi
POSTGRES_PASSWORD=strong_password
DOMAIN=dbmpa.ru
LETSENCRYPT_EMAIL=ops@dbmpa.ru
```

Если используется `www`, DNS-запись `www` должна указывать на тот же сервер. Caddy автоматически получает сертификат и редиректит `https://www.{DOMAIN}/...` на `https://{DOMAIN}/...`.

### Post-deploy smoke-check

```bash
./deploy/scripts/smoke-check.sh https://your-domain.com
```

Минимально проверить:

- `/timetable`
- `/admin`
- `/api/health/live`
- `/api/health/ready`
- `/robots.txt`
- `/sitemap.xml`
- `/api/courses-feed`
- `/api/tilda/health`
- `/assets/tilda-course-fields.js`

## Контент-операции в админке

### Создать курс

Минимум заполнить:

- `title`
- `slug`
- `courseLink`
- `catalogImg`
- `heroImg`
- `basePrice`
- `publish`

После сохранения проверить:

- `GET /api/courses-feed`
- `GET /api/tilda/courses/{slug}`

### Назначить скидку

Нужно указать:

- `title`
- `percent`
- `active`
- связанные `courses`

После сохранения проверить итоговую цену курса в feed и Tilda API.

### Запланировать изменение цены

Нужно указать:

- `course`
- `effectiveAt`
- `targetBasePrice`

После сохранения убедиться, что изменение появилось в `priceChanges` / `nextPriceChange`.

## Developer flow

Локальный запуск:

```bash
cd backend/strapi-app
cp .env.example .env
npm ci
npm run dev
```

Локальная проверка перед merge/deploy:

```bash
cd backend/strapi-app
npm run build
npm run test:ci
```

Минимальные ручные проверки:

- `/`
- `/admin`
- `GET /api/courses-feed`
- `GET /api/tilda/health`

## Rollback

Если deploy неудачный:

1. Посмотреть состояние контейнеров:

```bash
docker compose --env-file .env.prod -f docker-compose.selectel.yml ps
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f strapi
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f caddy
```

2. Найти предыдущий рабочий commit:

```bash
git log --oneline -n 10
```

3. Переключить сервер на этот commit:

```bash
git checkout <last_good_commit>
```

4. Повторно задеплоить:

```bash
./deploy/scripts/deploy-selectel.sh .env.prod
```

5. Повторить smoke-check.

## Production hygiene и полная очистка БД

### Безопасная Docker-чистка без удаления БД

Production Postgres volume проекта:

- volume: `academy_pg-data`
- mount path внутри контейнера: `/var/lib/postgresql/data`

При обычном обновлении и чистке Docker этот volume не удалять.

Безопасный cleanup старых контейнеров, образов, сетей и build cache:

```bash
cd /opt/academy
git pull
docker compose --env-file .env.prod -f docker-compose.selectel.yml up -d --build --remove-orphans
docker container prune
docker image prune -a
docker network prune
docker builder prune
./deploy/scripts/smoke-check.sh https://your-domain.com
```

Опасные команды для production-БД:

- не запускать `docker compose down -v`;
- не запускать `docker volume prune`;
- не запускать `docker system prune --volumes`;
- не удалять volume `academy_pg-data`.

Перед ручной чисткой можно проверить mount:

```bash
docker inspect academy-postgres-1 --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

Ожидаемая строка:

```text
academy_pg-data /var/lib/postgresql/data
```

### Полная очистка БД

Если на production стоит очень старая версия и данные в БД не нужны:

```bash
cd /opt/academy
git fetch --all --prune
git checkout main
git reset --hard origin/main
git clean -fdx -e .env.prod
docker compose --env-file .env.prod -f docker-compose.selectel.yml down --remove-orphans
docker volume rm academy_pg-data
docker volume rm academy_strapi-uploads   # только если не нужны медиа
docker image prune -af
docker builder prune -af
./deploy/scripts/deploy-selectel.sh .env.prod
```

Важно:

- `academy_pg-data` — production volume Postgres, смонтированный в `/var/lib/postgresql/data`;
- `academy_pg-data` нужно удалить обязательно, если нужна полностью пустая БД;
- `academy_strapi-uploads` удаляй только если медиа тоже не нужны;
- `caddy-data` и `caddy-config` удалять не нужно.

После полной очистки БД:

- открыть `/admin`;
- создать первого администратора Strapi;
- заново завести `Course`, `Discount`, `Course Price Change`, если они нужны.

## Secondary и дополнительные сценарии

### Secondary self-hosting

- `docker-compose.prod.yml` — вторичный standalone path без reverse proxy.
