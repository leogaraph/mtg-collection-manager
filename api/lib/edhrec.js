// ─── EDHREC: slug + parsing das sugestões ─────────────────────

// In-memory cache: slug → { data, ts }
export const edhrecCache = new Map()
export const CACHE_TTL = 24 * 60 * 60 * 1000  // 24h

export function toEdhrecSlug(name) {
  // "Hapatra, Vizier of Poisons" → "hapatra-vizier-of-poisons"
  // DFCs: use first face only
  const first = name.split('//')[0].trim()
  return first
    .toLowerCase()
    .replace(/[',.'`]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseEdhrecSuggestions(data, deckCardNames) {
  const cardlists = data?.container?.json_dict?.cardlists || []
  const suggestions = []
  for (const section of cardlists) {
    for (const card of section.cardviews || []) {
      if (!card.name) continue
      if (deckCardNames.has(card.name.toLowerCase())) continue
      suggestions.push({
        name:            card.name,
        synergy:         card.synergy        ?? 0,
        inclusion:       card.inclusion      ?? 0,
        num_decks:       card.num_decks      ?? 0,
        potential_decks: card.potential_decks ?? 0,
        salt:            card.salt           ?? 0,
        category:        section.tag || section.header || '',
      })
    }
  }
  suggestions.sort((a, b) => b.synergy - a.synergy)
  return suggestions
}
