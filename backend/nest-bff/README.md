# Nest.js как опциональный BFF

Добавляйте Nest.js поверх Strapi, если нужен отдельный API-слой.

Минимальный контракт BFF для этого фронта:
- `GET /schedule`
  - возвращает:
    - `months: Record<string, CourseDto[]>`
    - `undated: CourseDto[]`

Где `CourseDto` содержит только поля, используемые страницей.
