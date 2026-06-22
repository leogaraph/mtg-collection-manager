#!/usr/bin/env python3
"""
compute_phashes.py
-------------------
Calcula o dHash (64-bit, hex de 16 chars) das imagens locais em
ui/public/cards/{scryfall_id}.jpg e atualiza cards.phash.

O mesmo algoritmo de dHash e implementado em JS no Scanner (canvas):
resize para 9x8 em escala de cinza, compara cada pixel com o da
direita -> 64 bits.

Uso:
  python compute_phashes.py

Dependencias: pip install mysql-connector-python Pillow
"""

import os
from pathlib import Path

import mysql.connector
from PIL import Image

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"), "port": int(os.environ.get("DB_PORT", 3306)),
    "user": os.environ.get("DB_USER", "mtg"), "password": os.environ.get("DB_PASSWORD", "change_me_password"),
    "database": os.environ.get("DB_NAME", "mtg_collection"), "charset": "utf8mb4",
}

IMG_DIR = Path(__file__).parent / "ui" / "public" / "cards"


def dhash(image_path, hash_size=8):
    img = Image.open(image_path).convert("L").resize((hash_size + 1, hash_size), Image.LANCZOS)
    pixels = list(img.getdata())
    bits = 0
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * (hash_size + 1) + col]
            right = pixels[row * (hash_size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f"{bits:016x}"


def main():
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("SELECT id, scryfall_id FROM cards WHERE scryfall_id IS NOT NULL AND phash IS NULL")
    rows = cur.fetchall()
    print(f"{len(rows)} cards sem phash")

    updated = 0
    for card_id, scryfall_id in rows:
        path = IMG_DIR / f"{scryfall_id}.jpg"
        if not path.exists():
            continue
        try:
            h = dhash(path)
        except Exception as e:
            print(f"  erro {scryfall_id}: {e}")
            continue
        cur.execute("UPDATE cards SET phash = %s WHERE id = %s", (h, card_id))
        updated += 1
        if updated % 200 == 0:
            conn.commit()
            print(f"  {updated} processados...")

    conn.commit()
    print(f"Concluido: {updated} cards atualizados")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
