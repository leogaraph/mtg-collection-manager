#!/usr/bin/env python3
"""
test_api.py
-----------
Smoke test abrangente de todos os endpoints da API mtg_api.
Nao e um teste unitario formal (sem framework) - apenas garante que cada
rota responde com o status/forma esperada contra o banco real.

Uso:
  python test_api.py [--api http://localhost:3001]
"""
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

PASS = []
FAIL = []
TOKEN = None
RUN_ID = str(int(time.time()))  # sufixo unico por execucao - decks sao soft-delete
                                 # (is_active=0), entao o slug continua ocupado
                                 # entre rodadas e colidiria sem isso


def call(method, path, body=None, expect=200, raw=False, auth=True):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if auth and TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            raw_body = resp.read().decode()
            payload = raw_body if raw else (json.loads(raw_body) if raw_body else None)
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            raw_body = e.read().decode()
            payload = raw_body if raw else json.loads(raw_body)
        except Exception:
            payload = None
    except Exception as e:
        FAIL.append(f"{method} {path} -> EXCEPTION {e}")
        return None

    ok = (status == expect) if isinstance(expect, int) else status in expect
    label = f"{method} {path} -> {status}"
    if ok:
        PASS.append(label)
    else:
        FAIL.append(f"{label} (esperado {expect}) payload={payload}")
    return payload


def main():
    global API, TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:3001")
    args = ap.parse_args()
    API = args.api.rstrip("/") + "/api"

    # ── AUTH ──
    email = f"smoke-test-{RUN_ID}@example.com"
    reg = call("POST", "/auth/register", {"email": email, "password": "senha12345", "name": "Smoke Test"}, expect=201, auth=False)
    call("POST", "/auth/register", {"email": email, "password": "senha12345"}, expect=409, auth=False)
    call("POST", "/auth/register", {"email": "invalido", "password": "senha12345"}, expect=400, auth=False)
    call("POST", "/auth/register", {"email": "x@x.com", "password": "123"}, expect=400, auth=False)
    login = call("POST", "/auth/login", {"email": email, "password": "senha12345"}, auth=False)
    call("POST", "/auth/login", {"email": email, "password": "errada"}, expect=401, auth=False)
    if login:
        TOKEN = login["token"]
    call("GET", "/auth/me", auth=False, expect=401)
    call("GET", "/auth/me")  # com TOKEN ja setado

    call("POST", "/auth/api-token", {"password": "senhaerrada"}, expect=401)
    api_token = call("POST", "/auth/api-token", {"password": "senha12345"})
    if api_token:
        old_token, TOKEN = TOKEN, api_token["token"]
        call("GET", "/auth/me")  # confirma que o token de API tambem autentica
        TOKEN = old_token

    # ── CARDS ──
    cards = call("GET", "/cards?limit=5")
    call("GET", "/cards?q=Birds&limit=3")
    call("GET", "/cards?meta=1&limit=5")
    call("GET", "/cards?owned=digital&limit=5")
    call("GET", "/cards?tag=ramp&limit=5")
    call("GET", "/cards?colorIdentity=G,U&limit=5")
    call("GET", "/cards/arena-map")
    call("GET", "/cards/search?q=Sol")
    call("GET", "/cards/search?q=Sol&mode=text")

    sample_card_id = cards[0]["id"] if cards else None
    if sample_card_id:
        call("GET", f"/cards/{sample_card_id}")
        # nota: DELETE /cards/:id/tags/:name so remove a associacao card_tags,
        # a tag em si fica orfa (comportamento da API, nao e bug) - aceitavel
        # pra um smoke test, nao precisa de sufixo unico
        call("POST", f"/cards/{sample_card_id}/tags", {"name": "smoke-test-tag"}, expect=200)
        call("DELETE", f"/cards/{sample_card_id}/tags/smoke-test-tag")
    call("GET", "/cards/999999999", expect=404)

    created = call("POST", "/cards", {"name": "Smoke Test Card XYZ"}, expect=201)
    if created:
        cid = created["id"]
        call("PATCH", f"/cards/{cid}", {"mana_cost": "{1}{W}"})
        call("DELETE", f"/cards/{cid}")
    call("POST", "/cards", {}, expect=400)

    # ── DECKS ──
    decks = call("GET", "/decks")
    deck_id = decks[0]["id"] if decks else None
    if deck_id:
        deck = call("GET", f"/decks/{deck_id}")
        call("GET", f"/decks/{deck_id}/export", raw=True)
        call("GET", f"/decks/{deck_id}/suggestions?limit=5")
        if deck and deck.get("slug"):
            call("GET", f"/decks/{deck['slug']}", expect=(200, 302, 301))
    call("GET", "/decks/999999999", expect=404)

    deck_slug = f"smoke-test-deck-{RUN_ID}"
    newdeck = call("POST", "/decks", {"slug": deck_slug, "name": "Smoke Test"})
    call("POST", "/decks", {"slug": deck_slug, "name": "Duplicado"}, expect=409)
    if newdeck:
        did = newdeck["id"]
        call("PATCH", f"/decks/{did}", {"description": "teste"})
        dup = call("POST", f"/decks/{did}/duplicate")
        if dup:
            call("DELETE", f"/decks/{dup['id']}")
        call("DELETE", f"/decks/{did}")

    imp = call("POST", "/decks/import", {"name": f"Smoke Import {RUN_ID}", "text": "1 Sol Ring\n1 Arcane Signet"})
    if imp:
        did = imp["deck_id"]
        cards_resp = call("GET", f"/decks/{did}")
        if cards_resp and cards_resp["cards"]:
            cid = cards_resp["cards"][0]["id"]
            call("PATCH", f"/decks/{did}/cards/{cid}", {"quantity": 2})
            call("DELETE", f"/decks/{did}/cards/{cid}")
        call("DELETE", f"/decks/{did}")
    call("POST", "/decks/import", {}, expect=400)

    # ── TAGS ──
    call("GET", "/tags")
    tag = call("POST", "/tags", {"name": f"smoke-test-standalone-{RUN_ID}"}, expect=201)
    if tag:
        call("PATCH", f"/tags/{tag['id']}", {"description": "teste"})
        call("DELETE", f"/tags/{tag['id']}")
    call("DELETE", "/tags/999999999", expect=404)
    call("POST", "/tags/auto")

    # ── COLLECTION ──
    call("GET", "/collection?limit=5")
    call("GET", "/collection?source=physical&limit=5")
    if sample_card_id:
        call("POST", "/collection/digital", {"card_id": sample_card_id, "quantity": 1, "platform": "arena"})
        call("POST", "/collection/physical", {"card_id": sample_card_id, "quantity": 1})
        call("DELETE", f"/collection/physical/{sample_card_id}")
        call("DELETE", f"/collection/digital/{sample_card_id}?platform=arena")
    call("POST", "/collection/import-arena", {}, expect=400)
    call("POST", "/collection/import-arena", {"entries": [{"name": "Sol Ring", "count": 1}]})
    call("GET", "/collection/import-progress")

    # ── SYNC ──
    call("GET", "/sync/status")
    call("GET", "/sync/progress")

    # ── MATCHES ──
    call("GET", "/matches")
    call("GET", "/matches?limit=5")
    m = call("POST", "/matches", {
        "arena_match_id": f"smoke-test-match-{RUN_ID}",
        "opponent_name": "Smoke Bot",
        "started_at": "2026-06-23T10:00:00",
        "deck_arena_ids": [],
    })
    if m:
        call("PATCH", f"/matches/{m['id']}", {"result": "win", "ended_at": "2026-06-23T10:30:00"})
        call("DELETE", f"/matches/{m['id']}")
    call("DELETE", "/matches/999999999", expect=404)

    # ── SYNC LOG ──
    call("POST", "/sync-log", {"message": "smoke test"})
    call("GET", "/sync-log")

    # ── SCAN ──
    call("POST", "/scan", {"phash": "abcd1234abcd1234"})
    call("POST", "/scan", {"phash": "invalid"}, expect=400)

    # ── 404 ──
    call("GET", "/nonexistent-route", expect=404)

    print(f"\n{'='*60}")
    print(f"PASS: {len(PASS)}   FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFalhas:")
        for f in FAIL:
            print(" -", f)
        sys.exit(1)
    print("\nTodos os testes passaram.")


if __name__ == "__main__":
    main()
