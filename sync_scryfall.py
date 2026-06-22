#!/usr/bin/env python3
"""
sync_scryfall.py
----------------
1. Le todos os cards do banco que estao em decks
2. Busca dados no Scryfall via endpoint /cards/collection (batch 75)
3. Baixa imagens para ui/public/cards/{scryfall_id}.jpg
4. Atualiza cards no banco com scryfall_id, image_uri, keywords, etc.
5. Auto-detecta e define commanders por deck

Uso:
  python sync_scryfall.py              # todos os cards em decks
  python sync_scryfall.py --all        # todos os 737 cards
  python sync_scryfall.py --commanders # so os commanders (rapido)

Dependencias: pip install mysql-connector-python requests
"""

import os
import time
import json
import argparse
import hashlib
import re
from pathlib import Path

import requests
import mysql.connector

# ----------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"), "port": int(os.environ.get("DB_PORT", 3306)),
    "user": os.environ.get("DB_USER", "mtg"), "password": os.environ.get("DB_PASSWORD", "change_me_password"),
    "database": os.environ.get("DB_NAME", "mtg_collection"), "charset": "utf8mb4",
}

IMG_DIR     = Path(__file__).parent / "ui" / "public" / "cards"
SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection"
SCRYFALL_NAMED      = "https://api.scryfall.com/cards/named"
DELAY = 0.12   # 120ms entre requests (Scryfall pede >= 100ms)

IMG_DIR.mkdir(parents=True, exist_ok=True)

# Mapa deck slug -> nome provavel do commander
COMMANDER_HINTS = {
    "hapatra":    "Hapatra, Vizier of Poisons",
    "sephiroth":  "Yargle and Multani",       # ajuste se errado
    "auntie-ool": "Auntie Ool, the Feral Wit",
    "balmor":     "Balmor, Battlemage Captain",
    "aziza":      "Aziza, Deck Builder",
    "bre":        "Breena, the Demagogue",
    "go-shintai": "Go-Shintai of Life's Origin",
    "kodama":     "Kodama of the West Tree",
    "lorehold":   "Hofri Ghostforge",
    "prismari":   "Zaffai, Thunder Conductor",
    "raph-mikey": "Raphael, Fiendish Savior",
    "yarus":      "Yarus, Roar of the Old Gods",
}


# ----------------------------------------------------------------
# DB helpers
# ----------------------------------------------------------------
def get_conn():
    return mysql.connector.connect(**DB_CONFIG)

def get_cards_in_decks(cur):
    cur.execute("""
        SELECT DISTINCT c.id, c.name
        FROM cards c
        JOIN deck_cards dc ON dc.card_id = c.id
        ORDER BY c.name
    """)
    return cur.fetchall()

def get_all_cards(cur):
    cur.execute("SELECT id, name FROM cards ORDER BY name")
    return cur.fetchall()

def get_unsynced_cards(cur):
    cur.execute("SELECT id, name FROM cards WHERE scryfall_id IS NULL ORDER BY name")
    return cur.fetchall()

def update_card(cur, card_id, data: dict):
    fields = []
    values = []
    for k, v in data.items():
        fields.append(f"{k} = %s")
        values.append(v)
    values.append(card_id)
    cur.execute(f"UPDATE cards SET {', '.join(fields)} WHERE id = %s", values)


# ----------------------------------------------------------------
# Scryfall
# ----------------------------------------------------------------
def fetch_batch(names: list[str]) -> dict:
    """
    POST /cards/collection com ate 75 nomes.
    Retorna dict {name_lower: card_object}.
    """
    identifiers = [{"name": n} for n in names]
    resp = requests.post(
        SCRYFALL_COLLECTION,
        json={"identifiers": identifiers},
        headers={"User-Agent": "MTGCollectionManager/1.0"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    result = {}
    for card in data.get("data", []):
        result[card["name"].lower()] = card
    # not_found
    not_found = data.get("not_found", [])
    if not_found:
        print(f"  [!] Nao encontrado no Scryfall: {[n['name'] for n in not_found]}")
    time.sleep(DELAY)
    return result


def fetch_one(name: str) -> dict | None:
    """GET /cards/named?exact=name"""
    try:
        resp = requests.get(
            SCRYFALL_NAMED,
            params={"exact": name},
            headers={"User-Agent": "MTGCollectionManager/1.0"},
            timeout=10,
        )
        if resp.status_code == 404:
            # tenta fuzzy
            resp = requests.get(
                SCRYFALL_NAMED,
                params={"fuzzy": name},
                headers={"User-Agent": "MTGCollectionManager/1.0"},
                timeout=10,
            )
        resp.raise_for_status()
        time.sleep(DELAY)
        return resp.json()
    except Exception as e:
        print(f"  [!] Erro buscando '{name}': {e}")
        time.sleep(DELAY)
        return None


def download_image(scryfall_id: str, image_url: str) -> str | None:
    """
    Baixa imagem e salva em IMG_DIR/{scryfall_id}.jpg
    Retorna path relativo para o Vite: /cards/{id}.jpg
    """
    local_path = IMG_DIR / f"{scryfall_id}.jpg"
    if local_path.exists():
        return f"/cards/{scryfall_id}.jpg"

    try:
        resp = requests.get(image_url, timeout=20, stream=True)
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return f"/cards/{scryfall_id}.jpg"
    except Exception as e:
        print(f"  [!] Erro baixando imagem {scryfall_id}: {e}")
        return None


def extract_card_data(sc: dict) -> dict:
    """Extrai campos relevantes do objeto Scryfall."""
    # Imagem: prefere 'normal', fallback 'large'
    img_url = None
    uris = sc.get("image_uris", {})
    if uris:
        img_url = uris.get("normal") or uris.get("large") or uris.get("small")
    else:
        # DFC: pega a face frontal
        faces = sc.get("card_faces", [])
        if faces:
            face_uris = faces[0].get("image_uris", {})
            img_url = face_uris.get("normal") or face_uris.get("large")

    keywords = json.dumps(sc.get("keywords", []))
    prices = sc.get("prices", {})

    # color_identity: lista como "W,U,B" p/ filtro Commander
    color_identity = ",".join(sc.get("color_identity", []))
    colors = ",".join(sc.get("colors", []))

    return {
        "scryfall_id":   sc.get("id"),
        "oracle_id":     sc.get("oracle_id"),
        "arena_id":      sc.get("arena_id"),
        "layout":        sc.get("layout"),
        "cmc":           sc.get("cmc"),
        "keywords":      keywords,
        "colors":        colors or None,
        "color_identity": color_identity or None,
        "set_code":      sc.get("set"),
        "set_name":      sc.get("set_name"),
        "collector_number": sc.get("collector_number"),
        "rarity":        sc.get("rarity"),
        "released_at":   sc.get("released_at"),
        "artist":        sc.get("artist"),
        "flavor_text":   sc.get("flavor_text"),
        "edhrec_rank":   sc.get("edhrec_rank"),
        "price_usd":     prices.get("usd"),
        "price_usd_foil":prices.get("usd_foil"),
        "price_eur":     prices.get("eur"),
        "foil":          sc.get("foil", False),
        "nonfoil":       sc.get("nonfoil", True),
        "_img_url":      img_url,   # usado internamente, nao vai pro UPDATE
    }


# ----------------------------------------------------------------
# Commander detection
# ----------------------------------------------------------------
def set_commanders(cur, conn):
    print("\n[>] Detectando commanders por deck...")
    cur.execute("SELECT id, slug FROM decks")
    decks = cur.fetchall()

    for deck_id, slug in decks:
        hint = COMMANDER_HINTS.get(slug)
        if not hint:
            continue

        cur.execute("SELECT id FROM cards WHERE name = %s LIMIT 1", (hint,))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE decks SET commander_id = %s WHERE id = %s", (row[0], deck_id))
            print(f"  {slug:20s} -> {hint}")
        else:
            # tenta busca parcial
            cur.execute("SELECT id, name FROM cards WHERE name LIKE %s LIMIT 1", (f"%{hint.split(',')[0]}%",))
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE decks SET commander_id = %s WHERE id = %s", (row[0], deck_id))
                print(f"  {slug:20s} -> {row[1]} (fuzzy)")
            else:
                print(f"  {slug:20s} -> [nao encontrado: {hint}]")

    conn.commit()


# ----------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Sincroniza todas as cartas")
    parser.add_argument("--new", action="store_true", help="Sincroniza apenas cartas sem scryfall_id")
    parser.add_argument("--commanders", action="store_true", help="Apenas define commanders")
    args = parser.parse_args()

    conn = get_conn()
    cur  = conn.cursor()

    # --- Commanders ---
    set_commanders(cur, conn)

    if args.commanders:
        print("[OK] Apenas commanders atualizados.")
        cur.close(); conn.close()
        return

    # --- Cards a sincronizar ---
    if args.new:
        cards = get_unsynced_cards(cur)
    elif args.all:
        cards = get_all_cards(cur)
    else:
        cards = get_cards_in_decks(cur)

    print(f"\n[>] Sincronizando {len(cards)} cartas com Scryfall...")
    print(f"    Imagens salvas em: {IMG_DIR}")

    # Processa em batches de 75
    BATCH = 75
    total = len(cards)
    updated = 0
    imgs_downloaded = 0
    errors = 0

    for start in range(0, total, BATCH):
        batch = cards[start:start + BATCH]
        names = [c[1] for c in batch]
        id_by_name = {c[1].lower(): c[0] for c in batch}

        print(f"\n  Batch {start//BATCH + 1}/{(total-1)//BATCH + 1} ({len(batch)} cartas)...")

        try:
            scryfall_data = fetch_batch(names)
        except Exception as e:
            print(f"  [!] Erro no batch: {e} — tentando um a um...")
            scryfall_data = {}
            for name in names:
                sc = fetch_one(name)
                if sc:
                    scryfall_data[sc["name"].lower()] = sc

        for name_lower, card_id in id_by_name.items():
            sc = scryfall_data.get(name_lower)
            if not sc:
                # fallback: tenta busca individual (fuzzy), util p/ DFCs "A // B"
                orig_name = next(c[1] for c in batch if c[1].lower() == name_lower)
                sc = fetch_one(orig_name)
                if not sc:
                    errors += 1
                    continue

            data = extract_card_data(sc)
            img_url = data.pop("_img_url")

            # Baixa imagem se tiver URL
            local_img = None
            if img_url and data.get("scryfall_id"):
                local_img = download_image(data["scryfall_id"], img_url)
                if local_img:
                    imgs_downloaded += 1

            if local_img:
                data["image_uri"] = local_img
            elif img_url:
                data["image_uri"] = img_url  # fallback: URL externa

            # Remove None values
            data = {k: v for k, v in data.items() if v is not None}

            try:
                update_card(cur, card_id, data)
                updated += 1
            except Exception as e:
                print(f"  [!] Erro atualizando {name_lower}: {e}")
                errors += 1

        conn.commit()
        print(f"    -> {updated} atualizados, {imgs_downloaded} imagens baixadas, {errors} erros")

    print(f"""
[OK] Sincronizacao concluida!
     Cartas atualizadas : {updated}
     Imagens baixadas   : {imgs_downloaded}
     Erros              : {errors}
""")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
