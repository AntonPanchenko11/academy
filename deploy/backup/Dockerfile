FROM postgres:16-alpine

RUN apk add --no-cache tzdata

COPY deploy/backup/backup-postgres.sh /usr/local/bin/backup-postgres.sh
COPY deploy/backup/postgres-backup-crontab /etc/crontabs/root

RUN chmod +x /usr/local/bin/backup-postgres.sh

CMD ["crond", "-f", "-l", "8"]
