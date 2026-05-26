# Operations Runbook

Этот файл служит короткой точкой входа в эксплуатационные сценарии проекта.

Подробная архитектура, public API, developer flow и production правила зафиксированы в [README.md](/Users/antonpancenko/Documents/academy/README.md).

## Основные production paths

- Production-директория проекта на сервере: `/opt/academy`
- Канонический `Strapi` deploy path: [docker-compose.selectel.yml](/Users/antonpancenko/Documents/academy/docker-compose.selectel.yml) и [deploy/scripts/deploy-selectel.sh](/Users/antonpancenko/Documents/academy/deploy/scripts/deploy-selectel.sh)

## Production Runbook

Короткий flow для текущей архитектуры:

1. Подготовить `.env.prod`.
2. Проверить, что `PUBLIC_URL`, `ADMIN_URL`, `DOMAIN` и `CORS_ORIGIN` соответствуют production-доменам.
3. Запустить:

```bash
cd /opt/academy
./deploy/scripts/deploy-selectel.sh .env.prod
```

4. Проверить:

```bash
./deploy/scripts/smoke-check.sh https://your-domain.com
```

5. При необходимости посмотреть контейнеры и логи:

```bash
docker compose --env-file .env.prod -f docker-compose.selectel.yml ps
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f strapi
docker compose --env-file .env.prod -f docker-compose.selectel.yml logs -f caddy
```

6. При неудачном релизе вернуть предыдущий рабочий backend commit и повторить deploy.

## Docker Cleanup

Production Postgres volume:

- `academy_pg-data`
- mount path: `/var/lib/postgresql/data`

При обычном deploy и Docker cleanup этот volume не удалять.

Безопасная чистка:

```bash
cd /opt/academy
docker compose --env-file .env.prod -f docker-compose.selectel.yml up -d --build --remove-orphans
docker container prune
docker image prune -a
docker network prune
docker builder prune
```

Не запускать для production-БД:

- `docker compose down -v`
- `docker volume prune`
- `docker system prune --volumes`
- `docker volume rm academy_pg-data`
