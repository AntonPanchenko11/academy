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
2. Скрипт получает курс по `slug`, `id`, `documentId`, `url`, `path` или по `window.location.pathname`.
3. Скрипт подставляет данные курса в элементы с `data-course-field`.

## Подтягивание полей Course в Tilda-страницу

Если страница Tilda соответствует `courseLink` курса, helper сам вызовет `GET /api/tilda/courses/resolve?path=${window.location.pathname}`.

```html
<div
  class="js-tilda-course-fields"
  data-api-base="https://your-domain.com"
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

Если page URL и `courseLink` не совпадают, можно задать один из атрибутов:
- `data-course-slug="act"`
- `data-course-id="12"`
- `data-course-document-id="abc123"`
- `data-course-url="https://modern-psy.ru/act"`
- `data-course-path="/act"`

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
- `educationDocument`
- `courseLink`
- `coursePath`
- `slug`

У endpoint'ов поддерживается `fields=title,price,dateLabel`, если нужно получать только часть данных.

## Как это связано с Webstudio VPS

В режиме `docker-compose.webstudio-vps.yml` ассет `/assets/tilda-course-fields.js` отдается Strapi по `/assets/*`, а frontend обслуживает Webstudio runtime. Поэтому Tilda-страницы продолжают использовать тот же домен и те же endpoint'ы без отдельного backend в Tilda.
