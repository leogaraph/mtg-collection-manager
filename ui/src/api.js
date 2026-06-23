// Deriva o host da própria página: assim funciona tanto em localhost quanto
// acessando pela LAN/celular (ex: http://192.168.31.169:5173 → API em :3001 no mesmo host).
const HOST = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost'
export const API_BASE = `http://${HOST}:3001/api`
const BASE = API_BASE

const TOKEN_KEY = 'mtg_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

// Chamado sempre que a API responde 401 (token ausente/expirado/inválido) —
// App.jsx registra aqui a lógica de deslogar e voltar pra tela de login.
let unauthorizedHandler = () => {}
export const onUnauthorized = (fn) => { unauthorizedHandler = fn }

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) unauthorizedHandler()

  if (raw) {
    const text = await res.text()
    if (!res.ok) throw new Error(text || `Erro ${res.status}`)
    return text
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`)
  return data
}

export const api = {
  // ── Auth ──
  register: (email, password, name) => request('/auth/register', { method: 'POST', body: { email, password, name } }),
  login:    (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me:       () => request('/auth/me'),

  decks:        ()            => request('/decks'),
  deck:         (id)          => request(`/decks/${id}`),
  searchCards:  (q, opts = {}) => request(`/cards/search?${new URLSearchParams({ q, ...opts })}`),
  cards:        (params = {}) => request(`/cards?${new URLSearchParams(params)}`),
  tags:         ()            => request('/tags'),
  recomputeAutoTags: ()       => request('/tags/auto', { method: 'POST' }),
  suggestions:  (deckId, limit = 30) => request(`/decks/${deckId}/suggestions?limit=${limit}`),
  addTag:       (cardId, name) => request(`/cards/${cardId}/tags`, { method: 'POST', body: { name } }),
  removeTag:    (cardId, name) => request(`/cards/${cardId}/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  collection:   (params = {}) => request(`/collection?${new URLSearchParams(params)}`),

  setPhysical:    (body) => request('/collection/physical', { method: 'POST', body }),
  removePhysical: (cardId) => request(`/collection/physical/${cardId}`, { method: 'DELETE' }),

  setDigital:     (body) => request('/collection/digital', { method: 'POST', body }),
  removeDigital:  (cardId, platform) => request(`/collection/digital/${cardId}${platform ? `?platform=${platform}` : ''}`, { method: 'DELETE' }),

  updateDeck:       (id, body) => request(`/decks/${id}`, { method: 'PATCH', body }),
  duplicateDeck:    (id) => request(`/decks/${id}/duplicate`, { method: 'POST' }),
  deleteDeck:       (id) => request(`/decks/${id}`, { method: 'DELETE' }),

  importDeck:       (body) => request('/decks/import', { method: 'POST', body }),

  syncStatus:       () => request('/sync/status'),
  syncProgress:     () => request('/sync/progress'),
  sync:             (mode = 'new') => request('/sync', { method: 'POST', body: { mode } }),

  addCardToDeck:    (deckId, body) => request(`/decks/${deckId}/cards`, { method: 'POST', body }),
  updateDeckCard:   (deckId, cardId, body) => request(`/decks/${deckId}/cards/${cardId}`, { method: 'PATCH', body }),
  removeCardFromDeck: (deckId, cardId) => request(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' }),
  exportDeck:       (deckId) => request(`/decks/${deckId}/export`, { raw: true }),

  matches:          (params = {}) => request(`/matches?${new URLSearchParams(params)}`),

  scan:             (phash) => request('/scan', { method: 'POST', body: { phash } }),

  syncLog:          (sinceId = 0) => request(`/sync-log?since_id=${sinceId}`),

  importArenaCollection: (entries) => request('/collection/import-arena', { method: 'POST', body: { entries } }),
  importProgress:   () => request('/collection/import-progress'),
}
