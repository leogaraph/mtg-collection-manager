# MTG Collection Manager

Gerenciador pessoal de coleção e decks de Magic: The Gathering (Arena), com
banco de dados próprio, sincronização de dados via Scryfall, scanner de
cartas físicas por imagem e histórico de partidas do Arena.

Stack: **MySQL 8** + **API Express (Node)** + **UI React (Vite)**, tudo
orquestrado via Docker Compose — 3 containers.

## Quickstart para agentes de IA (Claude Code, OpenCode, Cursor, etc)

Esta seção é auto-contida e mecânica — siga os passos na ordem, execute os
comandos exatamente como estão, e use os comandos de verificação para
confirmar sucesso antes de seguir para o próximo passo. Não pule etapas.

**Pré-requisitos** (verificar antes de começar; se algum faltar, instale-o
primeiro — não assuma que está presente):

```bash
docker --version          # Docker Engine + Compose v2
docker compose version
```

**Passo 1 — clonar e entrar no diretório**

```bash
git clone <URL_DO_REPOSITORIO> mtg-collection-manager
cd mtg-collection-manager
```

**Passo 2 — criar `.env` a partir do template**

```bash
cp .env.example .env
```

Não é necessário editar os valores para rodar localmente — os defaults em
`.env.example` funcionam para desenvolvimento. Só troque as senhas se for
expor a porta 3306/3001/5173 além de `localhost`.

**Passo 3 — subir os 3 containers**

```bash
docker compose up -d --build
```

Isso builda `api` e `ui`, baixa a imagem `mysql:8.0`, e aplica
`db/schema.sql` automaticamente na primeira inicialização do volume.

**Passo 4 — verificar que os 3 containers estão saudáveis**

```bash
docker compose ps
```

Saída esperada: 3 serviços (`db`, `api`, `ui`) com status `running` (e `db`
eventualmente `healthy` — o healthcheck pode levar até ~30s na primeira
subida, já que o MySQL precisa inicializar o diretório de dados do zero).
Se `db` não ficar `healthy` em 60s, rode `docker compose logs db` e
verifique o erro antes de prosseguir — não tente contornar reiniciando
repetidamente sem diagnosticar.

**Passo 5 — verificar que a API responde**

```bash
curl -s http://localhost:3001/api/cards?limit=1
```

Esperado: JSON válido (pode ser uma lista vazia `[]` se o banco estiver
zerado — isso é normal numa instalação nova, não é erro).

**Passo 6 — verificar que a UI está servindo**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Esperado: `200`.

Se os passos 4-6 passarem, a instalação está completa e funcional. O banco
começa vazio — populá-lo com uma coleção real é opcional e está descrito em
"Popular a coleção" abaixo; não é necessário para considerar a instalação
bem-sucedida.

**Erros comuns e causa raiz** (não aplique workarounds sem diagnosticar):

| Sintoma | Causa provável | Ação |
|---|---|---|
| `db` nunca fica `healthy`, log mostra `Cannot create redo log files` | Diretório `./db/data` tem dados corrompidos de uma subida anterior interrompida | `docker compose down`, esvaziar `./db/data`, subir de novo |
| `api` reinicia em loop | `db` ainda não está healthy quando `api` tenta conectar | Confirmar `depends_on: condition: service_healthy` no compose (já configurado); aguardar `db` ficar healthy primeiro |
| Porta já em uso (`3306`/`3001`/`5173`) | Outro processo/container ocupando a porta | `docker ps -a` para achar o conflito; não mude a porta no compose sem necessidade |

## Funcionalidades

- Coleção digital (Arena/MTGO) e física, com quantidades reais
- Importação de decks no formato Arena/Moxfield (colar e pronto)
- Tags pessoais por carta (`#ramp`, `#draw`, `#sacrifice`...) e tags automáticas (staple/meta via EDHRec)
- Sincronização de dados de carta (preço, imagem, cores, legalidades) via [Scryfall API](https://scryfall.com/docs/api)
- Scanner de cartas físicas por foto (pHash de imagem)
- Histórico de partidas do Arena (via [mtga-tracker](../mtga-tracker), lendo `Player.log`)
- Curva de mana, distribuição de cores e "Deck Doctor" (sugestões de melhoria) por deck

## Arquitetura

```
db    (mysql:8.0)        — schema em db/schema.sql, dados em ./db/data (bind mount)
api   (Node/Express)     — api/index.js, porta 3001
ui    (React/Vite/nginx) — ui/, porta 5173
```

Imagens de cartas baixadas pela API são salvas em `ui/public/cards/` e
servidas tanto pela API quanto pela UI via volume compartilhado.

## Como rodar

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# edite .env e defina suas próprias senhas
```

### 2. Subir os containers

```bash
docker compose up -d --build
```

- UI: http://localhost:5173
- API: http://localhost:3001
- MySQL: `localhost:3306`

Para desenvolvimento da UI com hot-reload (Vite dev server em vez do build nginx):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ui
```

### 3. Popular a coleção (opcional)

Se você tem um export de coleção do Arena (ver seção abaixo), aplique as
quantidades reais:

```bash
pip install mysql-connector-python
DB_HOST=127.0.0.1 python update_collection_quantities.py mtga_collection.json
```

### 4. Sincronizar dados de carta (imagens, preços, etc)

```bash
pip install mysql-connector-python requests
python sync_scryfall.py --all
```

## Exportando sua coleção do MTG Arena

O Arena não tem exportação nativa de coleção. A forma viável hoje é ler a
memória do processo do jogo em execução com uma ferramenta como o
[MTGA-collection-exporter](https://github.com/NthPhantom10/MTGA-collection-exporter),
que gera um `mtga_collection.json` com nome, edição e quantidade real de
cada carta. O formato de saída é consumido diretamente por
`update_collection_quantities.py`.

> O antigo `GetPlayerCardsV3` do `Player.log` foi removido pela Wizards em
> 2021 — ferramentas que dependem só do log não conseguem mais a coleção
> completa.

## Scripts auxiliares

| Script | Função |
|---|---|
| `migrate_colecao.py` / `migrate_colecao_json.py` | Importa coleção/decks de um `.md` ou `.json` próprio (uso pontual, caminho configurável via `COLECAO_MD_PATH`/`COLECAO_JSON_PATH`) |
| `update_collection_quantities.py` | Aplica quantidades reais a partir de um export do Arena |
| `sync_scryfall.py` | Sincroniza dados/imagens/preços via Scryfall |
| `compute_phashes.py` | Calcula pHash das imagens locais (usado pelo Scanner) |
| `fix_commanders.py`, `add_hofri.py` | Correções pontuais de cartas específicas (scripts de uso único) |

Todos os scripts Python leem configuração de banco via variáveis de
ambiente (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), com
fallback para os valores de desenvolvimento padrão.

## Schema

Ver [`db/schema.sql`](db/schema.sql) — tabelas principais: `cards`,
`card_faces`, `card_legalities`, `collection_digital`,
`collection_physical`, `tags`/`card_tags`, `decks`/`deck_cards`, `matches`,
`sync_log`.

## Backup

Os dados do MySQL vivem em `./db/data` (bind mount, fora do Docker). Faça
backup dessa pasta periodicamente — ela **não** é recriada automaticamente
se for perdida.

## Licença

Projeto pessoal, uso livre.
