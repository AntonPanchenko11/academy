# Operations Runbook

Этот файл служит короткой точкой входа в эксплуатационные сценарии проекта.

Подробная архитектура, public API, developer flow и production правила зафиксированы в [README.md](/Users/antonpancenko/Documents/academy/README.md).

## Основные production paths

- Канонический `Strapi` deploy path: [docker-compose.selectel.yml](/Users/antonpancenko/Documents/academy/docker-compose.selectel.yml) и [deploy/scripts/deploy-selectel.sh](/Users/antonpancenko/Documents/academy/deploy/scripts/deploy-selectel.sh)
- `Webstudio` reverse-proxy path: [docker-compose.webstudio-vps.yml](/Users/antonpancenko/Documents/academy/docker-compose.webstudio-vps.yml) и [deploy/scripts/deploy-webstudio-vps.sh](/Users/antonpancenko/Documents/academy/deploy/scripts/deploy-webstudio-vps.sh)

## Webstudio Runbook

Пошаговый сценарий публикации `Webstudio`-контейнера и проверки после deploy описан в [deploy/WEBSTUDIO_VPS.md](/Users/antonpancenko/Documents/academy/deploy/WEBSTUDIO_VPS.md).

Короткий flow:

1. Подготовить `.env.prod`
2. Подготовить frontend-источник:
   локальный Docker-ready export в [webstudio/](/Users/antonpancenko/Documents/academy/webstudio) или `WEBSTUDIO_IMAGE`
3. Запустить:

```bash
./deploy/scripts/deploy-webstudio-vps.sh .env.prod
```

4. Проверить:

```bash
./deploy/scripts/smoke-check.sh https://your-domain.com
```

5. При необходимости посмотреть контейнеры и логи:

```bash
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml ps
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f strapi
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f webstudio
docker compose --env-file .env.prod -f docker-compose.webstudio-vps.yml logs -f caddy
```

6. При неудачном релизе вернуть предыдущий рабочий `backend + webstudio export` и повторить deploy
