# Academy Schedule App

Единый источник правды по проекту находится в этом `README.md`.

Если информация из других markdown-файлов конфликтует с этим документом, правильной считается информация отсюда.

Планируемые расширения и будущие этапы развития проекта фиксируются в [ROADMAP.md](/Users/antonpancenko/Documents/academy/ROADMAP.md). Для текущего реализованного состояния приоритет остается у этого `README.md`.

## Что это за проект

Проект обслуживает 4 рабочие поверхности:

1. Страница расписания "Расписание обучения и мероприятий в Академии".
2. Страницы на Tilda, которые получают данные отдельного курса.
3. Страницы на Webstudio, опубликованные как отдельный frontend-контейнер на том же домене.
4. Админка Strapi, через которую администратор управляет курсами, скидками и запланированными изменениями цен.

Текущая целевая архитектура:

- `backend/strapi-app` — единственный backend, CMS и API-источник данных.
- `index.html` + `frontend-db.js` + `assets/` — встроенная страница расписания, которую отдает сам Strapi.
- `/api/tilda/*` + `/assets/tilda-course-fields.js` — публичный API и helper для Tilda.
- `webstudio/` + `docker-compose.webstudio-vps.yml` + `deploy/caddy/Caddyfile.webstudio` — поддерживаемый deploy path для Webstudio-страниц, опубликованных отдельным контейнером за reverse proxy.
- `/admin` — обязательная operational surface для контент-администратора.

## Что уже реализовано

- `Strapi` зафиксирован как единственный backend.
- Bootstrap Strapi разрезан на отдельные server/bootstrap-модули; `src/index.js` сведен к orchestration-слою.
- Public DTO курса унифицирован для страницы расписания и Tilda API.
- Добавлен отдельный public namespace `/api/public/*` для `Webstudio`.
- Legacy aliases `priceIncreases` и `nextPriceIncrease` удалены из публичного DTO.
- `frontend-db.js` упрощен до UI-слоя `DTO -> render`.
- `assets/tilda-course-fields.js` стабилизирован: понятные состояния, retry после временных ошибок, предсказуемые события и упрощенный lifecycle.
- `assets/webstudio-course-fields.js` добавлен как единый helper для сценариев "один курс" и "список курсов" в `Webstudio`.
- Применение `Course Price Change` переведено на транзакционный батч-сценарий.
- Runtime maintenance убран из обычного boot-пути.
- Для `Webstudio`-контура добавлены `robots.txt`, `sitemap.xml`, same-origin routing и smoke-check.
- Для course pages в `Webstudio` добавлен единый SEO metadata source `/api/public/seo/*`.
- Regression-набор переведен на явный SQLite seed fixture.
- Локальный quality gate и GitHub Actions CI синхронизированы через `npm run test:ci`.
- Канонический production path зафиксирован через `docker-compose.selectel.yml` и `deploy-selectel.sh`.
- Поддерживаемый deployment path для `Webstudio` зафиксирован через `docker-compose.webstudio-vps.yml` и `deploy-webstudio-vps.sh`.

## Основные функции проекта

### 1. Страница расписания

Встроенная страница расписания:

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

### 3. Webstudio-интеграция

Проект поддерживает отдельный публичный frontend-контур для страниц, экспортированных из `Webstudio`.

Есть:

- `GET /api/public/courses`
- `GET /api/public/courses/:slug`
- `GET /api/public/courses/resolve?path=/course-page`
- `GET /api/public/seo/courses/:slug`
- `GET /api/public/seo/courses/resolve?path=/course-page`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `/assets/webstudio-course-fields.js`

Helper:

- работает через same-origin запросы к `/api/public/*`;
- поддерживает сценарии "один курс" и "список курсов";
- использует декларативные `data-*` атрибуты;
- выставляет predictable loading / empty / error states;
- dispatch'ит события для интегратора.

SEO:

- `Strapi` отдает единый metadata payload через `/api/public/seo/*`;
- `Webstudio` должен использовать этот payload во время сборки страницы или server-side render, а не как поздний client-side patch для основного SEO-контента.

Файлы:

- `assets/webstudio-course-fields.js`
- `deploy/caddy/Caddyfile.webstudio`
- `docker-compose.webstudio-vps.yml`
- `deploy/scripts/deploy-webstudio-vps.sh`

### 4. Админка Strapi

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

### Webstudio Public API

- `GET /api/public/courses`
- `GET /api/public/courses/{slug}`
- `GET /api/public/courses/resolve?path=/act`
- `GET /api/public/seo/courses/{slug}`
- `GET /api/public/seo/courses/resolve?path=/act`

Поддерживаемые query-параметры:

- `fields=title,price,dateLabel`
- `waitlist=true|false`
- `search=...`
- `q=...`

SEO payload для course pages возвращает:

- `title`
- `description`
- `canonicalUrl`
- `robots`
- `openGraph`

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
  data-api-base="https://your-domain.com"
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
<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>
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

- для production-страниц лучше задавать явный `data-course-slug`.

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

## Детали Webstudio

Проект поддерживает отдельный публичный frontend-контур для страниц, экспортированных из `Webstudio` и собранных в Docker-образ.

На текущем этапе зафиксированы такие правила:

- `Strapi` остается единственным backend и единственным источником данных;
- `Webstudio` публикуется отдельным контейнером;
- внешний домен обслуживается через reverse proxy;
- запросы со страниц `Webstudio` должны идти по same-origin маршрутам вида `/api/...`;
- маршруты `/api/*`, `/admin/*`, `/uploads/*`, `/assets/*` проксируются в `strapi`;
- остальные публичные маршруты проксируются в `webstudio`.

Практическая оговорка:

- в репозитории хранится минимальный fallback release для smoke-check и проверки routing-контура;
- для боевого deploy его нужно заменить export из `Webstudio` или задать `WEBSTUDIO_IMAGE`.

Публичный API для этого контура:

- `GET /api/public/courses`
- `GET /api/public/courses/{slug}`
- `GET /api/public/courses/resolve?path=/course-page`
- `/assets/webstudio-course-fields.js`

Контракт Webstudio namespace намеренно строже Tilda API:

- список поддерживает `fields`, `search`, `q`, `waitlist`;
- одиночный курс по path-параметру ищется только по `slug`;
- resolve-эндпоинт ищет только по `path`;
- `includeUnpublished` в этом namespace не поддерживается.

Helper для Webstudio:

- один asset обслуживает сценарии "один курс" и "список курсов";
- helper работает через same-origin запросы к `/api/public/*`;
- на root-элементах выставляет predictable loading / empty / error states;
- dispatch'ит события для интегратора.

### Пример одного курса в Webstudio

```html
<div
  class="js-webstudio-course-fields"
  data-course-slug="act"
  data-course-fields-extra="price,dateLabel,courseLink"
>
  <h1 data-course-field="title"></h1>
  <div data-course-field="price"></div>
  <div data-course-field="dateLabel" data-course-hide-empty="true"></div>
  <a data-course-field="courseLink" data-course-attr="href" href="#">
    Перейти к курсу
  </a>
</div>
<script src="https://your-domain.com/assets/webstudio-course-fields.js"></script>
```

### Пример списка курсов в Webstudio

```html
<div
  class="js-webstudio-course-list"
  data-filter-waitlist="false"
  data-course-search="актер"
  data-course-fields-extra="title,dateLabel,courseLink"
>
  <div data-course-list-template hidden>
    <h2 data-course-field="title"></h2>
    <div data-course-field="dateLabel" data-course-hide-empty="true"></div>
    <a data-course-field="courseLink" data-course-attr="href" href="#">
      Подробнее
    </a>
  </div>

  <div data-course-list-items></div>
</div>
<script src="https://your-domain.com/assets/webstudio-course-fields.js"></script>
```

### Состояния и события Webstudio helper

Для одного курса:

- `data-course-state="idle|loading|success|not-found|error"`
- `academy:webstudio:course-loading`
- `academy:webstudio:course-data`
- `academy:webstudio:course-not-found`
- `academy:webstudio:course-error`

Для списка курсов:

- `data-course-list-state="idle|loading|success|empty|error"`
- `academy:webstudio:courses-loading`
- `academy:webstudio:courses-data`
- `academy:webstudio:courses-empty`
- `academy:webstudio:courses-error`

### SEO для Webstudio-страниц

В Webstudio-сценарии SEO-артефакты сайта отдаются через `Strapi`:

- `/robots.txt`
- `/sitemap.xml`
- `/api/public/seo/courses/{slug}`
- `/api/public/seo/courses/resolve?path=/course-page`

`robots.txt` указывает на sitemap текущего `PUBLIC_URL`.

`sitemap.xml` собирается из:

- корня сайта `/`
- путей из `SEO_STATIC_PATHS`
- `coursePath` всех опубликованных курсов

Практическое правило:

- `SEO_STATIC_PATHS` должен содержать только canonical публичные маршруты сайта;
- страницы курсов должны иметь стабильный canonical path, совпадающий с `coursePath`;
- `title`, `description`, `canonical` и `Open Graph` для course pages должны строиться из payload `/api/public/seo/*`;
- основной контент SEO-важных страниц должен быть доступен в HTML, а не только после поздней client-side подгрузки.

## Репозиторий и структура

- `backend/strapi-app` — Strapi приложение.
- `index.html`, `frontend-db.js`, `assets/` — встроенная страница расписания.
- `Dockerfile.fullstack` — единый runtime.
- `docker-compose.selectel.yml` — канонический production deploy.
- `docker-compose.prod.yml` — secondary self-hosting сценарий.
- `docker-compose.webstudio-vps.yml` — поддерживаемый deploy path для Strapi + Webstudio + Caddy.
- `deploy/` — shell-скрипты и deploy-артефакты, включая Webstudio reverse-proxy path.
- `webstudio/` — директория для frontend release из `Webstudio`; в репозитории хранится минимальный fallback release.
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

Основной production flow:

1. Подготовить `.env.prod`
2. Сгенерировать секреты
3. Запустить deploy script

Команды:

```bash
cp .env.prod.example .env.prod
./deploy/scripts/generate-secrets.sh
./deploy/scripts/deploy-selectel.sh .env.prod
```

В этом режиме:

- frontend расписания встроен в Strapi;
- наружу публикуются только `80/443` через `caddy`;
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
PUBLIC_URL=https://academy.example.com
ADMIN_URL=https://academy.example.com/admin
CORS_ORIGIN=https://academy.example.com
POSTGRES_DB=academy
POSTGRES_USER=strapi
POSTGRES_PASSWORD=strong_password
DOMAIN=academy.example.com
LETSENCRYPT_EMAIL=ops@academy.example.com
```

### Post-deploy smoke-check

```bash
./deploy/scripts/smoke-check.sh https://your-domain.com
```

Минимально проверить:

- `/`
- `/admin`
- `/api/health/live`
- `/api/health/ready`
- `/robots.txt`
- `/sitemap.xml`
- `/api/courses-feed`
- `/api/public/courses`
- `/api/tilda/health`
- `/assets/tilda-course-fields.js`
- `/assets/webstudio-course-fields.js`

### Webstudio production deploy

Для сценария, где публичные страницы отдает контейнер `Webstudio`, использовать:

```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

Скрипт:

- проверяет обязательные env для `Strapi`, `Postgres` и `Caddy`;
- использует `WEBSTUDIO_IMAGE`, если он задан, иначе ожидает release в `webstudio/` с production `Dockerfile`;
- ждет readiness по `/api/health/ready`;
- по умолчанию запускает `smoke-check`.

Поддерживаемые deploy env:

- `DEPLOY_READY_URL`
- `DEPLOY_WAIT_READY_SECONDS`
- `DEPLOY_RUN_SMOKE_CHECK`
- `WEBSTUDIO_IMAGE`
- `SMOKE_WEBSTUDIO_COURSE_SLUG`

`smoke-check` для Webstudio-сценария дополнительно пытается проверить:

- `GET /api/public/courses/{slug}`
- `GET /api/public/seo/courses/{slug}`

Slug можно передать явно через `SMOKE_WEBSTUDIO_COURSE_SLUG`, иначе используется auto-discovery первого опубликованного курса из `/api/public/courses?fields=slug`.

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

Если на production стоит очень старая версия и данные в БД не нужны:

```bash
cd /path/to/academy
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

### Webstudio reverse-proxy deploy

- `docker-compose.webstudio-vps.yml` — поддерживаемый deployment path для сценария, где публичные страницы отдает `Webstudio`, а `Strapi` остается backend и admin-контуром.
- `deploy/caddy/Caddyfile.webstudio` маршрутизирует `/api/*`, `/admin/*`, `/uploads/*`, `/assets/*` в `strapi`, а остальные публичные маршруты — в `webstudio`.
- `deploy/scripts/deploy-webstudio-vps.sh` поднимает этот контур через `docker compose`.
- Перед deploy в `webstudio/` должен находиться экспорт `Webstudio` с production `Dockerfile`.
