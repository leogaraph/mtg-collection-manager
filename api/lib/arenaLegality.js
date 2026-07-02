// ─── Legalidade no Arena para cartas fora da coleção ──────────────────────
//
// O app é MTGA-first (decks.platform default 'arena'), mas as sugestões da
// EDHREC vêm do papel — boa parte nem existe no Arena. Cartas que já estão
// na coleção do usuário têm resposta local e imediata (cards.arena_id). Pra
// candidatos que NÃO estão na coleção (não sincronizados no catálogo local),
// consultamos a Scryfall em lote (mesmo endpoint usado no sync) e cacheamos
// por bastante tempo — legalidade no Arena muda pouco, raramente no mesmo dia.

import { scryfallFetchBatch } from './scryfall.js'

const cache = new Map() // name(lowercase) -> { legal: boolean, ts }
const TTL = 7 * 24 * 60 * 60 * 1000 // 7 dias

// Recebe nomes de carta, devolve Map(name.toLowerCase() -> true|false|null).
// null = não foi possível determinar (Scryfall indisponível) — tratar como
// "não filtra", pra falhar aberto e não esconder sugestões por um erro de rede.
export async function checkArenaLegality(names) {
  const result = new Map()
  const toFetch = []
  const now = Date.now()

  for (const name of names) {
    const key = name.toLowerCase()
    if (result.has(key)) continue
    const hit = cache.get(key)
    if (hit && now - hit.ts < TTL) result.set(key, hit.legal)
    else toFetch.push(name)
  }

  for (let i = 0; i < toFetch.length; i += 75) {
    const batch = toFetch.slice(i, i + 75)
    try {
      const found = await scryfallFetchBatch(batch) // já faz o POST + sleep(SYNC_DELAY)
      for (const name of batch) {
        const key = name.toLowerCase()
        const card = found[key]
        const legal = Boolean(card) && Array.isArray(card.games) && card.games.includes('arena')
        cache.set(key, { legal, ts: now })
        result.set(key, legal)
      }
    } catch (err) {
      console.error('Arena legality check failed:', err.message)
      for (const name of batch) result.set(name.toLowerCase(), null)
    }
  }

  return result
}
