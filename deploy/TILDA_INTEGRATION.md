# Интеграция с Tilda

Проект поддерживает только публичное чтение данных о курсах для Tilda-страниц.

## Что есть в проекте

Backend routes:
- `GET /api/tilda/health`
- `GET /api/tilda/courses`
- `GET /api/tilda/courses/:identifier`
- `GET /api/tilda/courses/resolve?path=/course-page`

Публичные ассеты:
- `/assets/tilda-course-fields.js`

## Как работает поток данных

1. Tilda-страница загружает `/assets/tilda-course-fields.js`.
2. Скрипт автоматически определяет `apiBase` по `data-api-base`, `window.ACADEMY_TILDA_COURSE.apiBase` или `src` подключенного helper-скрипта.
3. Скрипт получает курс по `slug`, `id`, `documentId`, `url`, `path`, canonical URL страницы или по `window.location.pathname`.
4. Скрипт подставляет данные курса в элементы с `data-course-field`.

## Подтягивание полей Course в Tilda-страницу

Если страница Tilda соответствует `courseLink` курса, helper сам вызовет `GET /api/tilda/courses/resolve?path=${window.location.pathname}`.

```html
<div
  class="js-tilda-course-fields"
  data-api-base="https://your-domain.com"
  data-course-slug="act"
  data-course-fields-extra="activeDiscount,upcomingPriceIncreases"
>
  <h1 data-course-field="title"></h1>
  <div data-course-field="price"></div>
  <div data-course-field="dateLabel" data-course-hide-empty="true"></div>
  <div data-course-field="studyDays" data-course-hide-empty="true"></div>
  <a data-course-field="courseLink" data-course-attr="href" href="#">
    Подробнее о курсе
  </a>
</div>
<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>
```

`data-api-base` необязателен, если script подключается напрямую с backend-домена:

```html
<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>
```

Тогда helper сам запросит `https://your-domain.com/api/tilda/...`.

Если page URL и `courseLink` не совпадают, можно задать один из атрибутов:
- `data-course-slug="act"`
- `data-course-id="12"`
- `data-course-document-id="abc123"`
- `data-course-url="https://modern-psy.ru/act"`
- `data-course-path="/act"`

Эти атрибуты можно задать:
- на самом блоке
- на общем контейнере страницы
- на `body` или `html`

Или перед подключением helper:

```html
<script>
  window.ACADEMY_TILDA_COURSE = {
    apiBase: 'https://your-domain.com',
    slug: 'act'
  };
</script>
<script src="https://your-domain.com/assets/tilda-course-fields.js"></script>
```

Если нужно запросить поля без прямой вставки в DOM:
- `data-course-fields-extra="activeDiscount,upcomingPriceIncreases"`
- или скрытый узел с `data-course-request-field="activeDiscount"`

Для вложенных pricing-данных можно использовать dot-path:
- `data-course-field="activeDiscount.label"`
- `data-course-field="nextPriceIncrease.projectedPriceLabel"`

Поддерживаемые поля:
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
- `basePrice`
- `discountPercent`
- `discountedPrice`
- `price`
- `scheduledIncreaseIds`
- `activeDiscount`
- `nextPriceIncrease`
- `upcomingPriceIncreases`
- `educationDocument`
- `courseLink`
- `coursePath`
- `slug`

У endpoint'ов поддерживается `fields=title,price,dateLabel`, если нужно получать только часть данных.

## Как это связано с Webstudio VPS

В режиме `docker-compose.webstudio-vps.yml` ассет `/assets/tilda-course-fields.js` отдается Strapi по `/assets/*`, а frontend обслуживает Webstudio runtime. Поэтому Tilda-страницы продолжают использовать тот же домен и те же endpoint'ы без отдельного backend в Tilda.
