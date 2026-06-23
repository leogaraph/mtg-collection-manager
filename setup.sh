#!/usr/bin/env bash
# setup.sh — instalação guiada do Mana Vault (MTG Collection Manager).
#
# Funciona tanto para um humano rodando `bash setup.sh` quanto para um
# agente de IA fazendo a instalação — não exige nenhuma decisão manual:
# detecta Docker, cria o .env com senhas aleatórias na primeira execução,
# e se uma porta padrão (3306/3001/5173) já estiver ocupada por outro
# programa, incrementa automaticamente e tenta de novo, em vez de só
# falhar e exigir edição manual do YAML.
#
# Uso:
#   bash setup.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Mana Vault — instalação ==="
echo

# ── 1. Pré-requisitos ──────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "[ERRO] Docker não encontrado no PATH."
  echo "       Instale o Docker Desktop: https://www.docker.com/products/docker-desktop"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "[ERRO] 'docker compose' (v2) não encontrado. Atualize o Docker Desktop."
  exit 1
fi
echo "[OK] Docker encontrado: $(docker --version)"

# ── 2. .env ──────────────────────────────────────────────────
rand_hex() {
  # openssl vem com o Git for Windows / qualquer Linux/Mac; fallback p/ /dev/urandom
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 12
  else
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-24
  fi
}

if [ ! -f .env ]; then
  cp .env.example .env
  # gera senhas aleatorias em vez de deixar os placeholders "change_me_*"
  ROOT_PASS=$(rand_hex)
  USER_PASS=$(rand_hex)
  sed -i "s/^MYSQL_ROOT_PASSWORD=.*/MYSQL_ROOT_PASSWORD=${ROOT_PASS}/" .env
  sed -i "s/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=${USER_PASS}/" .env
  echo "[OK] .env criado com senhas geradas aleatoriamente"
else
  echo "[OK] .env já existe, mantendo como está"
fi

get_env() { grep "^$1=" .env | head -1 | cut -d= -f2; }
set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s/^$1=.*/$1=$2/" .env
  else
    echo "$1=$2" >> .env
  fi
}

# garante que as variaveis de porta existem (instalacoes antigas podem nao ter)
for pair in "DB_PORT:3306" "API_PORT:3001" "UI_PORT:5173" "CONTAINER_PREFIX:mtg"; do
  var="${pair%%:*}"; default="${pair##*:}"
  grep -q "^${var}=" .env || echo "${var}=${default}" >> .env
done

# ── 3. Subir os containers, com retry automático em conflito de porta ──
MAX_ATTEMPTS=8
attempt=0
while [ $attempt -lt $MAX_ATTEMPTS ]; do
  attempt=$((attempt + 1))
  echo
  echo "[>] Subindo containers (tentativa $attempt/$MAX_ATTEMPTS)..."

  if OUTPUT=$(docker compose up -d --build 2>&1); then
    echo "$OUTPUT"
    echo
    echo "[OK] Containers no ar."
    break
  fi

  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -qiE "port is already allocated|address already in use|bind: An attempt was made"; then
    echo "[!] Porta ocupada por outro programa/container. Tentando portas novas..."
    docker compose down >/dev/null 2>&1 || true
    for var in DB_PORT API_PORT UI_PORT; do
      cur=$(get_env "$var")
      set_env "$var" "$((cur + 1))"
    done
  else
    echo
    echo "[ERRO] Falha não relacionada a conflito de porta — veja a saída acima."
    exit 1
  fi
done

if [ $attempt -eq $MAX_ATTEMPTS ]; then
  echo "[ERRO] Não consegui encontrar portas livres após $MAX_ATTEMPTS tentativas."
  echo "       Edite DB_PORT/API_PORT/UI_PORT manualmente no .env e rode novamente."
  exit 1
fi

# ── 4. Esperar o banco ficar healthy ──────────────────────────
DB_CONTAINER="$(get_env CONTAINER_PREFIX)_db"
echo
echo "[>] Aguardando '$DB_CONTAINER' ficar healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "[OK] Banco saudável."
    break
  fi
  sleep 2
done

# ── 5. Resumo final ────────────────────────────────────────────
UI_PORT=$(get_env UI_PORT)
API_PORT=$(get_env API_PORT)
DB_PORT=$(get_env DB_PORT)

echo
echo "================================================"
echo " Mana Vault instalado!"
echo "   UI:    http://localhost:${UI_PORT}"
echo "   API:   http://localhost:${API_PORT}"
echo "   MySQL: localhost:${DB_PORT}"
echo "================================================"
echo
echo "Próximos passos opcionais:"
echo "  - Importar sua coleção do Arena: ver README, seção 'Importando sua coleção do MTG Arena'"
echo "  - Rodar o smoke test da API: python api/test_api.py --api http://localhost:${API_PORT}"
