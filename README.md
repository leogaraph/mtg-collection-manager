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
| `db` nunca fica `healthy`, log mostra `Cannot create redo log files` ou `Unable to lock ./#ib_16384_0.dblwr` | Volume com dados corrompidos de uma subida anterior interrompida (comum em bind mounts no Windows — por isso o projeto usa named volume por padrão) | `docker compose down -v` (remove o volume) e subir de novo; se tiver backup, restaure com `db/restore.sh` depois |
| `api` reinicia em loop | `db` ainda não está healthy quando `api` tenta conectar | Confirmar `depends_on: condition: service_healthy` no compose (já configurado); aguardar `db` ficar healthy primeiro |
| Porta já em uso (`3306`/`3001`/`5173`) | Outro processo/container ocupando a porta | Defina `DB_PORT`/`API_PORT`/`UI_PORT` no `.env` para portas livres — não precisa editar o `docker-compose.yml` |
| Rodando uma 2ª instância do projeto na mesma máquina | Nomes de container colidem com uma instância já rodando | Defina `CONTAINER_PREFIX` (ex: `mtg2`) no `.env` dessa segunda instância |

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
db    (mysql:8.0)        — schema em db/schema.sql, dados em named volume (mysql_data)
api   (Node/Express)     — api/index.js, porta 3001
ui    (React/Vite/nginx) — ui/, porta 5173
```

> Por que named volume e não bind mount: MySQL 8 não trava corretamente
> os arquivos do datadir em bind mounts no Windows (erro `Unable to lock
> ./#ib_16384_0.dblwr error: 11`). Persistência real é garantida via
> backup/restore (`db/backup.sh`), não acessando os arquivos do volume
> diretamente — ver seção "Backup" abaixo.

Imagens de cartas baixadas pela API são salvas em `ui/public/cards/` e
servidas tanto pela API quanto pela UI via volume compartilhado.

## Como rodar

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# edite .env e defina suas próprias senhas
```

As portas (`DB_PORT`, `API_PORT`, `UI_PORT`) e o prefixo de nome dos
containers (`CONTAINER_PREFIX`) também vêm do `.env` — ajuste se já tiver
algo rodando nas portas padrão (3306/3001/5173) ou se quiser rodar uma
segunda instância do projeto na mesma máquina.

### 2. Subir os containers

```bash
docker compose up -d --build
```

- UI: http://localhost:5173 (ou o valor de `UI_PORT` no `.env`)
- API: http://localhost:3001 (ou `API_PORT`)
- MySQL: `localhost:3306` (ou `DB_PORT`)

Para desenvolvimento da UI com hot-reload (Vite dev server em vez do build nginx):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ui
```

### 3. Popular a coleção (opcional)

Se você tem um export de coleção do Arena, importe pela UI (ver seção
abaixo) ou via script (passo 3 da seção "Importando sua coleção").

### 4. Sincronizar dados de carta (imagens, preços, etc)

Pela UI: botão **"Sincronizar"** na aba Coleção. Ou via script:

```bash
pip install mysql-connector-python requests
python sync_scryfall.py --all
```

## Importando sua coleção do MTG Arena

O Arena **não tem exportação nativa de coleção** — não existe um botão
"exportar" no jogo. O caminho viável hoje é ler a memória do processo do
jogo em execução com uma ferramenta de terceiros. O antigo evento
`GetPlayerCardsV3` que aparecia no `Player.log` foi removido pela Wizards
em 2021, então ferramentas que dependem só do log não conseguem mais a
coleção completa — é preciso ler a memória do processo (`MTGA.exe`)
diretamente.

### Passo 1 — gerar o `mtga_collection.json`

Use o [MTGA-collection-exporter](https://github.com/NthPhantom10/MTGA-collection-exporter)
(ferramenta de terceiros, Python + `pymem`, lê a memória do `MTGA.exe`):

1. Abra o MTG Arena, vá na aba **Decks** ou **Coleção** e role a tela por
   ~30 segundos (isso garante que a coleção inteira foi carregada na
   memória do processo).
2. Clone e rode a ferramenta:
   ```bash
   git clone https://github.com/NthPhantom10/MTGA-collection-exporter
   cd MTGA-collection-exporter
   pip install pymem requests
   python mtg.py
   ```
3. O script pede **5 cartas raras/míticas que você sabe que possui, com a
   quantidade exata** (ex: "Ocelot Pride", depois "4") — isso calibra a
   busca na memória. Depois disso ele varre e gera `mtga_collection.json`
   (e `.txt`/`.csv`) na mesma pasta, com nome + edição + quantidade real
   de cada carta.

> Atenção: é uma ferramenta de terceiros que lê memória de processo —
> revise o código antes de rodar se isso for uma preocupação para você.

### Passo 2 — aplicar no banco

**Opção A — pela UI (recomendado):** na aba **Coleção**, clique em
**"Importar do Arena"** e selecione o arquivo `mtga_collection.json`
gerado no passo 1. A importação roda em background no servidor (coleções
têm 5 a 10 mil+ cartas, então isso pode levar de alguns segundos a
~1 minuto) — acompanhe a barra de progresso que aparece sob o botão.

**Opção B — via script**, equivalente em Python para quem prefere linha
de comando:

```bash
pip install mysql-connector-python
DB_HOST=127.0.0.1 python update_collection_quantities.py mtga_collection.json
```

Os dois caminhos fazem a mesma coisa: agregam as entradas por nome de
carta, criam registros mínimos para cartas que ainda não existem no banco,
e sobrescrevem `collection_digital.quantity` com a quantidade real lida da
memória do jogo (substituindo o `qty=1` fixo que vem de importações
manuais).

### Passo 3 — sincronizar dados das cartas novas

Cartas criadas no passo 2 que ainda não existiam no banco entram sem
imagem/preço/keywords. Rode o sync do Scryfall (botão "Sincronizar" na UI,
ou `python sync_scryfall.py --all`) para completá-las — isso também
recalcula as tags automáticas de habilidade (ver seção abaixo).

## Tags automáticas

Tags de habilidade (`flying`, `ramp`, `draw`, `lifelink`, `sacrifice`,
`counterspell`...) são geradas automaticamente a partir de
`cards.keywords` (keywords literais do Scryfall, ex: "Flying") e de
heurísticas em `cards.oracle_text` (para habilidades funcionais sem
keyword formal, ex: ramp/draw/tutor). Não precisa marcar manualmente.

O recálculo roda automaticamente ao final de toda sincronização Scryfall
(`POST /api/sync` ou `sync_scryfall.py`). Para forçar manualmente:

```bash
curl -X POST http://localhost:3001/api/tags/auto
```

Tags com menos de 2 cartas associadas são descartadas (evita ruído de
habilidades exclusivas de uma única carta, comuns em sets crossover).

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

Os dados do MySQL vivem num **named volume Docker** (`mysql_data`), não
num bind mount — eles sobrevivem a `docker compose down`/restart normal,
mas **não** sobrevivem a uma reinstalação completa do Docker Desktop ou
a um `docker volume prune`. Para persistência real, gere dumps SQL
periodicamente:

```bash
bash db/backup.sh                 # salva em db/backups/mtg_collection_<data>.sql
bash db/backup.sh meu_backup.sql  # nome customizado
```

Para restaurar (sobrescreve o banco atual):

```bash
bash db/restore.sh db/backups/mtg_collection_2026-06-23_120000.sql
```

`db/backups/` não é versionado (está no `.gitignore`) — guarde os dumps
em outro lugar (nuvem, outro disco) se quiser garantir contra perda total
da máquina.

## Licença

Projeto pessoal, uso livre.
