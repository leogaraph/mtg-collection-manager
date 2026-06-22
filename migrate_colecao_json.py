#!/usr/bin/env python3
"""
migrate_colecao_json.py
------------------------
Le E:/wiki/wiki/02-AREAS/pessoal/resources/magic/colecao.json (lista JSON com
~3886 cartas) e popula/atualiza o banco MySQL mtg_collection:

  - cards              (insere cartas novas; cartas ja sincronizadas com
                         Scryfall - scryfall_id preenchido - NAO sao
                         sobrescritas para nao perder imagem/colors/etc)
  - collection_digital (qty=1, platform=arena, para toda carta da lista)
  - tags / card_tags   (campo "tags" de cada carta)
  - decks / deck_cards (campo "decks" de cada carta)

Uso:
  python migrate_colecao_json.py             # roda a migracao
  python migrate_colecao_json.py --dry-run   # so mostra stats
"""

import os
import sys
import json
import argparse
import mysql.connector
from pathlib import Path

# ----------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------
JSON_PATH = Path(os.environ.get("COLECAO_JSON_PATH", "./colecao.json"))

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "127.0.0.1"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USER", "mtg"),
    "password": os.environ.get("DB_PASSWORD", "change_me_password"),
    "database": os.environ.get("DB_NAME", "mtg_collection"),
    "charset":  "utf8mb4",
}


# ----------------------------------------------------------------
# DB helpers
# ----------------------------------------------------------------
def get_or_create_card(cur, card: dict):
    """Retorna (card_id, is_new). Atualiza dados basicos se a carta ainda
    nao foi sincronizada com Scryfall (scryfall_id NULL)."""
    name = card["name"]
    mana_cost   = card.get("cost") or None
    cmc         = card.get("cmc")
    colors      = ",".join(card.get("colors") or []) or None
    type_line   = card.get("type") or None
    oracle_text = card.get("text") or None

    cur.execute("SELECT id, scryfall_id FROM cards WHERE name = %s LIMIT 1", (name,))
    row = cur.fetchone()

    if row:
        card_id, scryfall_id = row
        if not scryfall_id:
            cur.execute(
                """
                UPDATE cards
                   SET mana_cost = %s, cmc = %s, colors = %s,
                       type_line = %s, oracle_text = %s, updated_at = NOW()
                 WHERE id = %s
                """,
                (mana_cost, cmc, colors, type_line, oracle_text, card_id),
            )
        return card_id, False

    cur.execute(
        """
        INSERT INTO cards (name, mana_cost, cmc, colors, type_line, oracle_text)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (name, mana_cost, cmc, colors, type_line, oracle_text),
    )
    return cur.lastrowid, True


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

    print("[>] Lendo", JSON_PATH)
    with open(JSON_PATH, encoding="utf-8") as f:
        cards = json.load(f)
    print(f"    -> {len(cards)} cartas no JSON\n")

    if not cards:
        print("[ERRO] Nenhuma carta encontrada.")
        sys.exit(1)

    all_decks = sorted({d for c in cards for d in c.get("decks", [])})
    all_tags  = sorted({t for c in cards for t in c.get("tags", [])})
    print(f"Decks referenciados ({len(all_decks)}): {', '.join(all_decks)}")
    print(f"Tags unicas        ({len(all_tags)}): {', '.join(all_tags)}\n")

    if args.dry_run:
        print("[DRY] --dry-run: nenhuma escrita no banco.")
        for c in cards[:5]:
            print(f"  {c['name']:<40} cost={c.get('cost')!s:<10} "
                  f"cmc={c.get('cmc')!s:<5} colors={c.get('colors')} "
                  f"tags={c.get('tags')} decks={c.get('decks')}")
        print("  ...")
        return

    print("[DB] Conectando ao MySQL...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cur  = conn.cursor()

    stats = {"new": 0, "existing": 0, "tag_assoc": 0, "deck_cards": 0}

    try:
        for i, card in enumerate(cards, 1):
            card_id, is_new = get_or_create_card(cur, card)
            upsert_collection_digital(cur, card_id)
            stats["new" if is_new else "existing"] += 1

            for tag_name in card.get("tags", []):
                tag_id = get_or_create_tag(cur, tag_name)
                upsert_card_tag(cur, card_id, tag_id)
                stats["tag_assoc"] += 1

            for deck_slug in card.get("decks", []):
                deck_id = get_or_create_deck(cur, deck_slug)
                upsert_deck_card(cur, deck_id, card_id)
                stats["deck_cards"] += 1

            if i % 200 == 0:
                conn.commit()
                print(f"    ... {i}/{len(cards)} cartas processadas")

        conn.commit()

    except Exception as e:
        conn.rollback()
        print("\n[ERRO]", e)
        raise
    finally:
        cur.close()
        conn.close()

    print("\n[OK] Migracao concluida!")
    print(f"     Cartas novas              : {stats['new']}")
    print(f"     Cartas ja existentes      : {stats['existing']}")
    print(f"     Associacoes card->tag     : {stats['tag_assoc']}")
    print(f"     Entradas deck_cards       : {stats['deck_cards']}")
    print(f"     Decks referenciados       : {len(all_decks)}")
    print("\n[>] Proximo passo: rode sync_scryfall.py --all para baixar")
    print("    imagens e dados (color_identity, preco, etc) das cartas novas.")


if __name__ == "__main__":
    main()
