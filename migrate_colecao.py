#!/usr/bin/env python3
"""
migrate_colecao.py
------------------
Le E:/wiki/wiki/02-AREAS/pessoal/resources/magic/colecao.md
e popula o banco MySQL mtg_collection com:
  - cards
  - collection_digital (qty=1, platform=arena para cada carta)
  - decks  (slugs extraidos da coluna Decks)
  - deck_cards
  - tags   (extraidas da coluna Tags, ex: #draw #ramp)
  - card_tags

Dependencias:
  pip install mysql-connector-python

Uso:
  python migrate_colecao.py
  python migrate_colecao.py --dry-run   # mostra stats sem escrever no banco
"""

import os
import re
import sys
import argparse
import mysql.connector
from pathlib import Path

# ----------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------
COLECAO_PATH = Path(os.environ.get("COLECAO_MD_PATH", "./colecao.md"))

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "127.0.0.1"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USER", "mtg"),
    "password": os.environ.get("DB_PASSWORD", "change_me_password"),
    "database": os.environ.get("DB_NAME", "mtg_collection"),
    "charset":  "utf8mb4",
}

# Mapeamento emoji de cor -> codigo(s) W/U/B/R/G
COLOR_MAP = {
    "⬜": "W",   # quadrado branco
    "\U0001f535": "U",  # circulo azul
    "⬛": "B",   # quadrado preto
    "\U0001f534": "R",  # circulo vermelho
    "\U0001f7e2": "G",  # circulo verde
}


# ----------------------------------------------------------------
# PARSING
# ----------------------------------------------------------------
def parse_colors(raw: str) -> str:
    """Converte emojis de cor em 'W,U' etc."""
    codes = []
    for emoji, code in COLOR_MAP.items():
        if emoji in raw:
            codes.append(code)
    return ",".join(codes) if codes else ""


def parse_tags(raw: str) -> list:
    """Extrai ['draw', 'ramp'] de '#draw #ramp' ou '-'."""
    if not raw or raw.strip() in ("-", "—"):
        return []
    return [t.lstrip("#").strip() for t in raw.split() if t.startswith("#")]


def parse_decks(raw: str) -> list:
    """Extrai ['bre', 'lorehold'] de 'bre, lorehold'."""
    if not raw or raw.strip() in ("-", "—"):
        return []
    return [d.strip() for d in raw.split(",") if d.strip()]


def parse_table(md_path: Path) -> list:
    """Le o arquivo .md e retorna lista de dicts com os campos de cada carta."""
    cards = []
    in_table = False

    with open(md_path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")

            # Detecta inicio da tabela
            if line.startswith("| Carta") and "Custo" in line:
                in_table = True
                continue

            # Pula linha separadora (|---|---|...)
            if in_table and re.match(r"^\|\s*-+", line):
                continue

            # Linha de dados
            if in_table and line.startswith("|"):
                cols = [c.strip() for c in line.split("|")]
                cols = [c for c in cols if c != ""]

                if len(cols) < 7:
                    continue

                name      = cols[0]
                mana_cost = cols[1] if cols[1] not in ("-", "—") else None
                colors    = parse_colors(cols[2])
                type_line = cols[3] if cols[3] not in ("-", "—") else None
                oracle    = cols[4] if cols[4] not in ("-", "—") else None
                tags_raw  = cols[5]
                decks_raw = cols[6]

                cards.append({
                    "name":        name,
                    "mana_cost":   mana_cost,
                    "colors":      colors,
                    "type_line":   type_line,
                    "oracle_text": oracle,
                    "tags":        parse_tags(tags_raw),
                    "decks":       parse_decks(decks_raw),
                })

    return cards


# ----------------------------------------------------------------
# INSERCAO
# ----------------------------------------------------------------
def upsert_card(cur, card: dict) -> int:
    """Insere ou atualiza carta. Retorna o card_id."""
    cur.execute(
        """
        INSERT INTO cards (name, mana_cost, colors, type_line, oracle_text)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          mana_cost   = VALUES(mana_cost),
          colors      = VALUES(colors),
          type_line   = VALUES(type_line),
          oracle_text = VALUES(oracle_text),
          updated_at  = NOW()
        """,
        (card["name"], card["mana_cost"], card["colors"],
         card["type_line"], card["oracle_text"]),
    )
    cur.execute("SELECT id FROM cards WHERE name = %s ORDER BY id LIMIT 1",
                (card["name"],))
    row = cur.fetchone()
    return row[0]


def upsert_collection_digital(cur, card_id: int):
    cur.execute(
        """
        INSERT INTO collection_digital (card_id, quantity, platform)
        VALUES (%s, 1, 'arena')
        ON DUPLICATE KEY UPDATE quantity = quantity
        """,
        (card_id,),
    )


def get_or_create_tag(cur, tag_name: str) -> int:
    cur.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
    return cur.lastrowid


def upsert_card_tag(cur, card_id: int, tag_id: int):
    cur.execute(
        "INSERT IGNORE INTO card_tags (card_id, tag_id) VALUES (%s, %s)",
        (card_id, tag_id),
    )


def get_or_create_deck(cur, slug: str) -> int:
    cur.execute("SELECT id FROM decks WHERE slug = %s", (slug,))
    row = cur.fetchone()
    if row:
        return row[0]
    name = " ".join(w.capitalize() for w in slug.replace("-", " ").split())
    cur.execute("INSERT INTO decks (slug, name) VALUES (%s, %s)", (slug, name))
    return cur.lastrowid


def upsert_deck_card(cur, deck_id: int, card_id: int):
    cur.execute(
        """
        INSERT IGNORE INTO deck_cards (deck_id, card_id, quantity, board)
        VALUES (%s, %s, 1, 'main')
        """,
        (deck_id, card_id),
    )


# ----------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Apenas parseia e mostra stats, sem gravar no banco")
    args = parser.parse_args()

    print("[>] Lendo", COLECAO_PATH)
    cards = parse_table(COLECAO_PATH)
    print("    ->", len(cards), "cartas encontradas\n")

    if not cards:
        print("[ERRO] Nenhuma carta encontrada. Verifique o caminho.")
        sys.exit(1)

    all_decks = sorted({d for c in cards for d in c["decks"]})
    all_tags  = sorted({t for c in cards for t in c["tags"]})
    print("Decks unicos (%d): %s" % (len(all_decks), ", ".join(all_decks)))
    print("Tags unicas  (%d): %s\n" % (len(all_tags),  ", ".join(all_tags)))

    if args.dry_run:
        print("[DRY] --dry-run: nenhuma escrita no banco.")
        for c in cards[:5]:
            print("  %-40s cores=%-8s tags=%s decks=%s" % (
                c["name"], c["colors"], c["tags"], c["decks"]))
        print("  ...")
        return

    print("[DB] Conectando ao MySQL...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cur  = conn.cursor()

    stats = {"cards": 0, "tag_assoc": 0, "deck_cards": 0}

    try:
        for i, card in enumerate(cards, 1):
            card_id = upsert_card(cur, card)
            upsert_collection_digital(cur, card_id)
            stats["cards"] += 1

            for tag_name in card["tags"]:
                tag_id = get_or_create_tag(cur, tag_name)
                upsert_card_tag(cur, card_id, tag_id)
                stats["tag_assoc"] += 1

            for deck_slug in card["decks"]:
                deck_id = get_or_create_deck(cur, deck_slug)
                upsert_deck_card(cur, deck_id, card_id)
                stats["deck_cards"] += 1

            if i % 50 == 0:
                conn.commit()
                print("    ... %d/%d cartas processadas" % (i, len(cards)))

        conn.commit()

    except Exception as e:
        conn.rollback()
        print("\n[ERRO]", e)
        raise
    finally:
        cur.close()
        conn.close()

    print("\n[OK] Migracao concluida!")
    print("     Cards inseridos/atualizados : %d" % stats["cards"])
    print("     Associacoes card->tag        : %d" % stats["tag_assoc"])
    print("     Entradas deck_cards          : %d" % stats["deck_cards"])
    print("     Decks criados               : %d" % len(all_decks))


if __name__ == "__main__":
    main()
