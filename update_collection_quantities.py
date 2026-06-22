#!/usr/bin/env python3
"""
update_collection_quantities.py
--------------------------------
Le mtga_collection.json (gerado pelo MTGA-collection-exporter, com
quantidade REAL lida da memoria do jogo) e atualiza collection_digital
no banco mtg_collection com as quantidades corretas (em vez do qty=1
fixo que vinha do colecao.json antigo).

Uso:
  python update_collection_quantities.py /caminho/mtga_collection.json
  python update_collection_quantities.py /caminho/mtga_collection.json --dry-run
"""

import os
import sys
import json
import argparse
import mysql.connector
from pathlib import Path

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "127.0.0.1"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USER", "mtg"),
    "password": os.environ.get("DB_PASSWORD", "change_me_password"),
    "database": os.environ.get("DB_NAME", "mtg_collection"),
    "charset":  "utf8mb4",
}


def get_or_create_card(cur, name: str) -> int:
    cur.execute("SELECT id FROM cards WHERE name = %s LIMIT 1", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("INSERT INTO cards (name) VALUES (%s)", (name,))
    return cur.lastrowid


def upsert_quantity(cur, card_id: int, quantity: int):
    cur.execute(
        """
        INSERT INTO collection_digital (card_id, quantity, platform)
        VALUES (%s, %s, 'arena')
        ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_at = NOW()
        """,
        (card_id, quantity),
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("[>] Lendo", args.json_path)
    with open(args.json_path, encoding="utf-8") as f:
        entries = json.load(f)
    print(f"    -> {len(entries)} entradas (nome+edicao) no JSON\n")

    # Agrega por nome (a colecao do banco nao distingue edicao hoje)
    by_name = {}
    for e in entries:
        by_name[e["name"]] = by_name.get(e["name"], 0) + e["count"]
    print(f"    -> {len(by_name)} nomes unicos apos agregar edicoes\n")

    if args.dry_run:
        for name, qty in list(by_name.items())[:10]:
            print(f"  {qty:>3}x {name}")
        print("  ...")
        print("\n[DRY] --dry-run: nenhuma escrita no banco.")
        return

    print("[DB] Conectando ao MySQL...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()

    stats = {"updated": 0, "new_cards": 0}
    try:
        for i, (name, qty) in enumerate(by_name.items(), 1):
            cur.execute("SELECT id FROM cards WHERE name = %s LIMIT 1", (name,))
            row = cur.fetchone()
            is_new = row is None
            card_id = get_or_create_card(cur, name)
            upsert_quantity(cur, card_id, qty)
            stats["updated"] += 1
            if is_new:
                stats["new_cards"] += 1

            if i % 500 == 0:
                conn.commit()
                print(f"    ... {i}/{len(by_name)} processadas")

        conn.commit()
    except Exception as e:
        conn.rollback()
        print("\n[ERRO]", e)
        raise
    finally:
        cur.close()
        conn.close()

    print("\n[OK] Atualizacao concluida!")
    print(f"     Quantidades atualizadas : {stats['updated']}")
    print(f"     Cartas novas criadas    : {stats['new_cards']}")


if __name__ == "__main__":
    main()
