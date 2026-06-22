import { useState, useEffect } from 'react'
import { api } from '../api'
import { ManaPips } from './ManaPips'

const RARITY_COLOR = {
  common:   'text-gray-400',
  uncommon: 'text-slate-300',
  rare:     'text-yellow-400',
  mythic:   'text-orange-400',
}

const CATEGORY_LABEL = {
  creatures:    'Criaturas',
  instants:     'Instantâneos',
  sorceries:    'Feitiços',
  enchantments: 'Encantamentos',
  artifacts:    'Artefatos',
  lands:        'Terrenos',
  planeswalkers:'Planeswalkers',
  'high-synergy-cards': 'Alta Sinergia',
  'top-cards':  'Mais Populares',
  'new-cards':  'Novidades',
}

function SynergyBar({ value }) {
  const pct = Math.min(Math.max(value * 100, 0), 100)
  const color =
    value >= 0.5 ? 'bg-green-500' :
    value >= 0.25 ? 'bg-yellow-500' :
    'bg-blue-500'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 bg-arena-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${
        value >= 0.5 ? 'text-green-400' : value >= 0.25 ? 'text-yellow-400' : 'text-blue-400'
      }`}>
        {value >= 0 ? `+${Math.round(pct)}%` : `${Math.round(pct)}%`}
      </span>
    </div>
  )
}

function SuggestionCard({ card, deckId, onAdd, onHover }) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  async function handleAdd() {
    if (!card.inCollection) return
    setAdding(true)
    // Need to find card id first — search by name
    try {
      const results = await api.searchCards(card.name, {})
      const match = results.find(r => r.name.toLowerCase() === card.name.toLowerCase())
      if (match) {
        await api.addCardToDeck(deckId, { card_id: match.id, quantity: 1 })
        setAdded(true)
        onAdd?.()
      }
    } catch (e) {
      console.error('Add failed', e)
    }
    setAdding(false)
  }

  return (
    <div
      className="relative flex items-center gap-3 bg-arena-card hover:bg-arena-card/80 border border-arena-border hover:border-arena-border/80 rounded-lg px-3 py-2 transition-colors group"
      onMouseEnter={e => onHover?.(card, e)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Card thumbnail */}
      <div className="w-8 h-11 flex-shrink-0 rounded overflow-hidden bg-arena-bg border border-arena-border/50">
        {card.image_uri ? (
          <img src={card.image_uri} alt={card.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-arena-muted text-[8px] text-center px-0.5">{card.name.slice(0,6)}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-xs font-semibold truncate ${RARITY_COLOR[card.rarity] || 'text-arena-text'}`}>
            {card.name}
          </span>
          {card.inCollection && (
            <span className="flex-shrink-0 text-[9px] bg-green-900/60 text-green-400 border border-green-800/60 rounded px-1 py-px">
              ✓ coleção
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SynergyBar value={card.synergy} />
          {card.mana_cost && (
            <div className="flex-shrink-0">
              <ManaPips cost={card.mana_cost} size="xs" />
            </div>
          )}
        </div>
        {card.type_line && (
          <p className="text-arena-muted text-[10px] truncate mt-0.5">{card.type_line}</p>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!card.inCollection || added || adding}
        title={card.inCollection ? 'Adicionar ao deck' : 'Não está na sua coleção'}
        className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm transition-colors ${
          added
            ? 'bg-green-800/60 text-green-400 cursor-default'
            : card.inCollection
              ? 'bg-arena-border hover:bg-arena-gold hover:text-arena-bg text-arena-muted cursor-pointer'
              : 'bg-arena-border/30 text-arena-border cursor-not-allowed'
        }`}
      >
        {added ? '✓' : adding ? '…' : '+'}
      </button>
    </div>
  )
}

export function SuggestionsPanel({ deckId, commanderName, onAdd, onHover }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')  // all | owned
  const [limit, setLimit] = useState(30)

  useEffect(() => {
    if (!deckId) return
    setLoading(true)
    setError(null)
    api.suggestions(deckId, limit)
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [deckId, limit])

  const suggestions = data?.suggestions || []
  const shown = filter === 'owned'
    ? suggestions.filter(s => s.inCollection)
    : suggestions

  const ownedCount = suggestions.filter(s => s.inCollection).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-arena-border flex-shrink-0">
        <div>
          <h2 className="text-arena-gold text-sm font-semibold">Sugestões EDHREC</h2>
          {commanderName && (
            <p className="text-arena-muted text-xs mt-0.5 truncate">{commanderName}</p>
          )}
        </div>
        {data?.slug && (
          <a
            href={`https://edhrec.com/commanders/${data.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-arena-muted hover:text-arena-gold text-xs transition-colors"
          >
            Ver no EDHREC ↗
          </a>
        )}
      </div>

      {/* Filters */}
      {!loading && suggestions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-arena-border flex-shrink-0">
          <div className="flex bg-arena-card rounded p-0.5 gap-0.5 border border-arena-border text-xs">
            {[['all', `Todas (${suggestions.length})`], ['owned', `Na coleção (${ownedCount})`]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filter === v ? 'bg-arena-gold text-arena-bg font-medium' : 'text-arena-muted hover:text-arena-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {data?.total > limit && (
            <button
              onClick={() => setLimit(l => l + 30)}
              className="ml-auto text-xs text-arena-muted hover:text-arena-gold transition-colors"
            >
              + mostrar mais
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-6 h-6 border-2 border-arena-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-arena-muted text-xs">Buscando sugestões...</p>
          </div>
        )}

        {!loading && error && (
          <div className="text-red-400 text-xs p-3 bg-red-900/20 rounded-lg border border-red-800/30">
            Erro ao buscar sugestões: {error}
          </div>
        )}

        {!loading && data?.reason && (
          <div className="text-arena-muted text-xs p-3 bg-arena-card rounded-lg text-center">
            {data.reason}
          </div>
        )}

        {!loading && !error && shown.length === 0 && suggestions.length > 0 && (
          <div className="text-arena-muted text-xs text-center p-4">
            Nenhuma carta da coleção nas sugestões. Mude o filtro para "Todas".
          </div>
        )}

        {!loading && !error && shown.length > 0 && (
          <div className="space-y-1.5">
            {/* Synergy legend */}
            <div className="flex items-center gap-4 text-[10px] text-arena-muted px-1 mb-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Alta sinergia (≥50%)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Média (≥25%)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Baixa</span>
            </div>

            {shown.map((card, i) => (
              <SuggestionCard
                key={`${card.name}-${i}`}
                card={card}
                deckId={deckId}
                onAdd={onAdd}
                onHover={onHover}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
