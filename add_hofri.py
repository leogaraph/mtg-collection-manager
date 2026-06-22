#!/usr/bin/env python3
import os, requests, time, mysql.connector
from pathlib import Path

DB = dict(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", 3306)),
          user=os.environ.get("DB_USER", "mtg"), password=os.environ.get("DB_PASSWORD", "change_me_password"),
          database=os.environ.get("DB_NAME", "mtg_collection"), charset="utf8mb4")
IMG_DIR = Path(r"E:\wiki\code\mtg-collection-manager\ui\public\cards")
H = {"User-Agent": "MTGCollectionManager/1.0"}

conn = mysql.connector.connect(**DB)
cur  = conn.cursor()

r = requests.get("https://api.scryfall.com/cards/named", params={"fuzzy": "Hofri Ghostforge"}, headers=H, timeout=10)
sc = r.json()
sid = sc["id"]
name = sc["name"]
img_url = sc.get("image_uris", {}).get("normal")

# Baixa imagem
local = IMG_DIR / f"{sid}.jpg"
if not local.exists() and img_url:
    local.write_bytes(requests.get(img_url, headers=H, timeout=20).content)
local_img = f"/cards/{sid}.jpg"

# Insere carta
cur.execute("""
    INSERT INTO cards (name, mana_cost, colors, color_identity, type_line, oracle_text,
                       rarity, set_code, scryfall_id, image_uri)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE scryfall_id=VALUES(scryfall_id), image_uri=VALUES(image_uri)
""", (
    name, sc.get("mana_cost"),
    ",".join(sc.get("colors",[])), ",".join(sc.get("color_identity",[])),
    sc.get("type_line"), sc.get("oracle_text"),
    sc.get("rarity"), sc.get("set"), sid, local_img
))
conn.commit()

cur.execute("SELECT id FROM cards WHERE name=%s LIMIT 1", (name,))
card_id = cur.fetchone()[0]

cur.execute("UPDATE decks SET commander_id=%s WHERE slug='lorehold'", (card_id,))
conn.commit()

print(f"[OK] {name} (id={card_id}) -> commander do Lorehold. Imagem: {local_img}")
cur.close(); conn.close()
