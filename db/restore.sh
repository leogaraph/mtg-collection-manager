#!/usr/bin/env bash
# restore.sh — restaura um dump SQL gerado por backup.sh.
#
# ATENÇÃO: sobrescreve o banco atual. Os dados existentes que colidirem
# com o dump serão substituídos.
#
# Uso:
#   bash db/restore.sh db/backups/mtg_collection_2026-06-23_120000.sql

set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?Uso: bash db/restore.sh <arquivo.sql>}"
[ -f "$FILE" ] || { echo "[ERRO] Arquivo não encontrado: $FILE"; exit 1; }

[ -f .env ] && set -a && source .env && set +a

CONTAINER="${CONTAINER_PREFIX:-mtg}_db"
DB_USER="${MYSQL_USER:-mtg}"
DB_PASS="${MYSQL_PASSWORD:?MYSQL_PASSWORD não definido — copie .env.example para .env}"
DB_NAME="${MYSQL_DATABASE:-mtg_collection}"

echo "[>] Restaurando $FILE em '$DB_NAME' (container $CONTAINER)..."
docker exec -i "$CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$FILE"

echo "[OK] Restauração concluída."
