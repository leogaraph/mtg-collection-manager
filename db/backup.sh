#!/usr/bin/env bash
# backup.sh — gera um dump SQL do banco mtg_collection em db/backups/.
#
# Por que isso existe: o banco vive num named volume Docker (nao um bind
# mount), porque MySQL 8 trava no Windows quando o datadir e' um bind
# mount (erro "Unable to lock ./#ib_16384_0.dblwr error: 11"). Named
# volumes sobrevivem a `docker compose down`/restart normal, mas nao a
# uma reinstalacao completa do Docker Desktop ou reset de fabrica - por
# isso a forma real de garantir persistencia e' rodar este script
# periodicamente, nao confiar nos arquivos do volume.
#
# Uso:
#   bash db/backup.sh                # usa .env do diretorio atual
#   bash db/backup.sh meu_backup.sql # nome customizado

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && source .env && set +a

CONTAINER="${CONTAINER_PREFIX:-mtg}_db"
DB_USER="${MYSQL_USER:-mtg}"
DB_PASS="${MYSQL_PASSWORD:?MYSQL_PASSWORD não definido — copie .env.example para .env}"
DB_NAME="${MYSQL_DATABASE:-mtg_collection}"

mkdir -p db/backups
OUT="${1:-db/backups/mtg_collection_$(date +%Y-%m-%d_%H%M%S).sql}"

echo "[>] Gerando dump de '$DB_NAME' (container $CONTAINER) -> $OUT"
docker exec "$CONTAINER" mysqldump -u"$DB_USER" -p"$DB_PASS" \
  --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" > "$OUT"

echo "[OK] Backup salvo em $OUT ($(du -h "$OUT" | cut -f1))"
