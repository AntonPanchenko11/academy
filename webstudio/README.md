# Webstudio Release Directory

Эта директория предназначена для экспортированного frontend release из `Webstudio`.

Актуальная архитектура, API и эксплуатационные правила описаны в корневом [README.md](/Users/antonpancenko/Documents/academy/README.md) и в [deploy/WEBSTUDIO_VPS.md](/Users/antonpancenko/Documents/academy/deploy/WEBSTUDIO_VPS.md).

В репозитории уже лежит минимальный fallback release:

- `Dockerfile`
- `default.conf`
- `site/index.html`

Он нужен, чтобы production contour можно было поднять и проверить даже до появления реального export из `Webstudio`.

Ожидаемый минимальный состав боевого release:

- `Dockerfile`
- собранные статические файлы или runtime-файлы frontend-приложения

Практическое правило:

- содержимое этой директории не редактируется вручную как исходный frontend проекта;
- fallback release можно использовать только для smoke-check и базовой маршрутизации;
- для боевого frontend-релиза содержимое этой директории заменяется результатом явного export/build из `Webstudio`, который затем поднимается через `docker-compose.webstudio-vps.yml`.
