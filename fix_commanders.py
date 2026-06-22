#!/usr/bin/env python3
"""Corrige commanders e imagens faltantes."""
import os, requests, time, json, mysql.connector
from pathlib import Path

DB = dict(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", 3306)),
          user=os.environ.get("DB_USER", "mtg"), password=os.environ.get("DB_PASSWORD", "change_me_password"),
          database=os.environ.get("DB_NAME", "mtg_collection"), charset="utf8mb4")
IMG_DIR = Path(r"E:\wiki\code\mtg-collection-manager\ui\public\cards")
HEADERS = {"User-Agent": "MTGCollectionManager/1.0"}

conn = mysql.connector.connect(**DB)
cur  = conn.cursor()

# Cartas a buscar pelo nome fuzzy
to_fix = [
    "Birgi, God of Storytelling",
    "Breena, the Demagogue",
    "Zaffai, Thunder Conductor",
    "Hofri Ghostforge",
]

for name in to_fix:
    print(f"\n[>] {name}")
    r = requests.get("https://api.scryfall.com/cards/named",
                     params={"fuzzy": name}, headers=HEADERS, timeout=10)
    time.sleep(0.12)
    if r.status_code != 200:
        print(f"    Nao encontrado ({r.status_code})")
        continue

    sc = r.json()
    found_name = sc.get("name")
    sid = sc.get("id")
    print(f"    Encontrado: {found_name} ({sid})")

    # Imagem (DFC: pega face frontal)
    img_url = (sc.get("image_uris") or {}).get("normal")
    if not img_url:
        faces = sc.get("card_faces", [])
        if faces:
            img_url = (faces[0].get("image_uris") or {}).get("normal")

    local_path = None
    if img_url and sid:
        local = IMG_DIR / f"{sid}.jpg"
        if not local.exists():
            ir = requests.get(img_url, timeout=20, headers=HEADERS)
            local.write_bytes(ir.content)
            print(f"    Imagem baixada: {local.name}")
        local_path = f"/cards/{sid}.jpg"

    # Atualiza card no banco
    cur.execute("""
        UPDATE cards SET scryfall_id=%s, image_uri=%s, set_code=%s, rarity=%s
        WHERE name = %s
    """, (sid, local_path, sc.get("set"), sc.get("rarity"), name))

    # Se a carta com nome diferente foi encontrada, tenta pelo nome retornado tambem
    if found_name != name:
        cur.execute("""
            UPDATE cards SET scryfall_id=%s, image_uri=%s, set_code=%s, rarity=%s
            WHERE name = %s
        """, (sid, local_path, sc.get("set"), sc.get("rarity"), found_name))

    print(f"    Banco atualizado.")

# Lorehold: Hofri Ghostforge como commander
cur.execute("SELECT id FROM cards WHERE name LIKE 'Hofri%' LIMIT 1")
row = cur.fetchone()
if row:
    cur.execute("UPDATE decks SET commander_id=%s WHERE slug='lorehold'", (row[0],))
    print(f"\n[>] Lorehold commander -> Hofri (id={row[0]})")

# Prismari: Zaffai
cur.execute("SELECT id FROM cards WHERE name LIKE 'Zaffai%' LIMIT 1")
row = cur.fetchone()
if row:
    cur.execute("UPDATE decks SET commander_id=%s WHERE slug='prismari'", (row[0],))
    print(f"[>] Prismari commander -> Zaffai (id={row[0]})")

# Bre: Breena
cur.execute("SELECT id FROM cards WHERE name LIKE 'Breena%' LIMIT 1")
row = cur.fetchone()
if row:
    cur.execute("UPDATE decks SET commander_id=%s WHERE slug='bre'", (row[0],))
    print(f"[>] Bre commander -> Breena (id={row[0]})")

conn.commit()
print("\n[OK] Pronto!")
cur.close()
conn.close()
