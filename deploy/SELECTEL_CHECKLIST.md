# Selectel VPS checklist

Чеклист для production-развертывания проекта на удаленном сервере.

Основной сценарий деплоя описан в [deploy/SELECTEL_VPS.md](/Users/antonpancenko/Documents/academy/deploy/SELECTEL_VPS.md).

## Что уже покрыто проектом

- `postgres + strapi` в `docker-compose.prod.yml`
- `postgres + strapi + caddy` в `docker-compose.selectel.yml`
- `postgres + strapi + webstudio + caddy` в `docker-compose.webstudio-vps.yml`
- TLS и reverse proxy через Caddy
- readiness endpoint: `GET /api/health/ready`
- liveness endpoint: `GET /api/health/live`
- Tilda course API и публичный JS-ассет `tilda-course-fields.js`

## Что обязательно сделать на сервере

1. Подготовить DNS:
- `A`/`AAAA` запись домена должна указывать на VPS
- `PUBLIC_URL`, `ADMIN_URL`, `DOMAIN` должны совпадать с боевым доменом

2. Закрыть лишние порты:
- наружу открыть только `80` и `443`
- `5432` и `1337` не публиковать наружу
- проверять, что на VPS используется стек `docker-compose.selectel.yml` или `docker-compose.webstudio-vps.yml`, а не локальный `docker-compose.prod.yml`

3. Заполнить production env:
- сильный `POSTGRES_PASSWORD`
- все `STRAPI_*` секреты
- точный `CORS_ORIGIN`
- не оставлять `CORS_ORIGIN=*`

4. Проверить persistent storage:
- volume `pg-data` для Postgres
- volume `strapi-uploads` для загружаемых файлов
- не деплоить без постоянных volume

5. Настроить резервное копирование:
- регулярный `pg_dump`
- отдельная копия `strapi-uploads`
- хранить бэкапы вне VPS: отдельное хранилище, S3-совместимый bucket или снапшоты

6. Инициализировать админку:
- открыть `/admin`
- создать первого администратора
- выдать доступ только нужным сотрудникам
- проверить, что в Content Manager виден `Course`

7. Проверить CRUD курсов:
- создать тестовый курс из админки
- заполнить `title`, `slug`, `courseLink`, `publish`
- убедиться, что курс виден в `GET /api/tilda/courses`
- убедиться, что `GET /api/tilda/courses/{slug}` возвращает именно его

8. Проверить интеграцию Tilda:
- `GET /api/tilda/health`
- `GET /assets/tilda-course-fields.js`
- открыть Tilda-страницу курса и проверить подстановку полей

9. Добавить наблюдаемость:
- собирать `docker compose logs` для `strapi`, `postgres`, `caddy`
- мониторить `GET /api/health/ready`
- настроить алерт на недоступность `GET /api/tilda/health`

## Риски, которые стоит закрыть отдельно

- Сейчас нет автотестов и smoke-тестов после деплоя.
- Сейчас нет отдельной роли/moderation flow для контент-редакторов внутри Strapi.

## Минимальный smoke-check после деплоя

```bash
curl -f https://your-domain.com/api/health/live
curl -f https://your-domain.com/api/health/ready
curl -f https://your-domain.com/api/tilda/health
curl -f https://your-domain.com/api/tilda/courses
curl -f https://your-domain.com/assets/tilda-course-fields.js
```
