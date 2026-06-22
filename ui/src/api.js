// Deriva o host da própria página: assim funciona tanto em localhost quanto
// acessando pela LAN/celular (ex: http://192.168.31.106:5173 → API em :3001 no mesmo host).
const HOST = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost'
export const API_BASE = `http://${HOST}:3001/api`
const BASE = API_BASE

export const api = {
  decks:        ()            => fetch(`${BASE}/decks`).then(r => r.json()),
  deck:         (id)          => fetch(`${BASE}/decks/${id}`).then(r => r.json()),
  searchCards:  (q, opts = {}) => {
    const qs = new URLSearchParams({ q, ...opts }).toString()
    return fetch(`${BASE}/cards/search?${qs}`).then(r => r.json())
  },
  cards:        (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return fetch(`${BASE}/cards?${qs}`).then(r => r.json())
  },
  tags:         ()            => fetch(`${BASE}/tags`).then(r => r.json()),
  recomputeAutoTags: ()       => fetch(`${BASE}/tags/auto`, { method:'POST' }).then(r => r.json()),
  suggestions:  (deckId, limit = 30) => fetch(`${BASE}/decks/${deckId}/suggestions?limit=${limit}`).then(r => r.json()),
  addTag:       (cardId, name) => fetch(`${BASE}/cards/${cardId}/tags`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) }).then(r => r.json()),
  removeTag:    (cardId, name) => fetch(`${BASE}/cards/${cardId}/tags/${encodeURIComponent(name)}`, { method:'DELETE' }).then(r => r.json()),
  collection:   (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return fetch(`${BASE}/collection?${qs}`).then(r => r.json())
  },

  setPhysical:    (body) => fetch(`${BASE}/collection/physical`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  removePhysical: (cardId) => fetch(`${BASE}/collection/physical/${cardId}`, { method:'DELETE' }).then(r => r.json()),

  setDigital:     (body) => fetch(`${BASE}/collection/digital`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  removeDigital:  (cardId, platform) => fetch(`${BASE}/collection/digital/${cardId}${platform ? `?platform=${platform}` : ''}`, { method:'DELETE' }).then(r => r.json()),

  updateDeck:       (id, body) => fetch(`${BASE}/decks/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  duplicateDeck:    (id) => fetch(`${BASE}/decks/${id}/duplicate`, { method:'POST' }).then(r => r.json()),
  deleteDeck:       (id) => fetch(`${BASE}/decks/${id}`, { method:'DELETE' }).then(r => r.json()),

  importDeck:       (body) => fetch(`${BASE}/decks/import`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(async r => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro ao importar deck')
    return data
  }),

  syncStatus:       () => fetch(`${BASE}/sync/status`).then(r => r.json()),
  syncProgress:     () => fetch(`${BASE}/sync/progress`).then(r => r.json()),
  sync:             (mode = 'new') => fetch(`${BASE}/sync`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode }) }).then(async r => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro ao sincronizar')
    return data
  }),

  addCardToDeck:    (deckId, body) => fetch(`${BASE}/decks/${deckId}/cards`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  updateDeckCard:   (deckId, cardId, body) => fetch(`${BASE}/decks/${deckId}/cards/${cardId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  removeCardFromDeck: (deckId, cardId) => fetch(`${BASE}/decks/${deckId}/cards/${cardId}`, { method:'DELETE' }).then(r => r.json()),
  exportDeck:       (deckId) => fetch(`${BASE}/decks/${deckId}/export`).then(r => r.text()),

  matches:          (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return fetch(`${BASE}/matches?${qs}`).then(r => r.json())
  },

  scan:             (phash) => fetch(`${BASE}/scan`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phash }) }).then(r => r.json()),

  syncLog:          (sinceId = 0) => fetch(`${BASE}/sync-log?since_id=${sinceId}`).then(r => r.json()),
}
