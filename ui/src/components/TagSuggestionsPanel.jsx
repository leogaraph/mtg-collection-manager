import { useState, useEffect } from 'react'
import { api } from '../api'
import { ManaPips } from './ManaPips'
import { tagStyle, tagChipStyle } from '../utils/tags'

function TagChip({ name, boosted }) {
  const { icon } = tagStyle(name)
  return (
    <span
      className={`chip !text-[9px] !px-1.5 !py-0.5 ${boosted ? 'ring-1 ring-arena-gold font-semibold' : ''}`}
      style={tagChipStyle(name)}
      title={boosted ? `#${name} está baixo no deck (Deck Doctor) — essa carta recebeu boost de score` : undefined}
    >
      {icon && <span className="leading-none">{icon}</span>}
      {boosted && <span className="leading-none">⚡</span>}
      {name}
    </span>
  )
}

function CandidateCard({ card, deckId, onAdd, onHover }) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  async function handleAdd() {
    setAdding(true)
    try {
      await api.addCardToDeck(deckId, { card_id: card.id, quantity: 1 })
      setAdded(true)
      onAdd?.()
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
      <div className="w-8 h-11 flex-shrink-0 rounded overflow-hidden bg-arena-bg border border-arena-border/50">
        {card.image_uri ? (
          <img src={card.image_uri} alt={card.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-arena-muted text-[8px] text-center px-0.5">{card.name.slice(0, 6)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate text-arena-text">{card.name}</span>
          <span className="flex-shrink-0 text-[9px] bg-arena-gold/15 text-arena-gold border border-arena-gold/40 rounded px-1 py-px" title="Pontuação de sinergia: soma ponderada das tags em comum (tags genéricas como #staple pesam menos; tags que o Deck Doctor marcou como baixas no deck recebem boost — veja ⚡)">
            {card.score} pts
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          {card.mana_cost && <ManaPips cost={card.mana_cost} size="xs" />}
        </div>
        <div className="flex flex-wrap gap-1">
          {card.matchedTags.slice(0, 5).map(t => (
            <TagChip key={t} name={t} boosted={card.boostedTags?.includes(t)} />
          ))}
        </div>
      </div>

      <button
        onClick={handleAdd}
        disabled={added || adding}
        title="Adicionar ao deck"
        className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm transition-colors ${
          added
            ? 'bg-green-800/60 text-green-400 cursor-default'
            : 'bg-arena-border hover:bg-arena-gold hover:text-arena-bg text-arena-muted cursor-pointer'
        }`}
      >
        {added ? '✓' : adding ? '…' : '+'}
      </button>
    </div>
  )
}

export function TagSuggestionsPanel({ deckId, onAdd, onHover }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [limit, setLimit] = useState(30)
  const [selectedTags, setSelectedTags] = useState(new Set())

  useEffect(() => {
    if (!deckId) return
    setLoading(true)
    setError(null)
    api.tagSuggestions(deckId, limit, [...selectedTags])
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [deckId, limit, selectedTags])

  const suggestions = data?.suggestions || []
  const topTags = Object.entries(data?.tagCounts || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  function toggleTag(name) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-arena-border flex-shrink-0">
        <h2 className="text-arena-gold text-sm font-semibold">Sugestões por Tags</h2>
        <p className="text-arena-muted text-xs mt-0.5">
          {selectedTags.size > 0
            ? 'Clique nas tags para filtrar — clique de novo pra tirar'
            : 'Cartas da sua coleção com as combinações de tags que o deck mais usa'}
        </p>
        {data?.deficientTags?.length > 0 && (
          <p className="text-arena-muted text-[10px] mt-1">
            ⚡ Deck Doctor: <span className="text-arena-gold">{data.deficientTags.join(', ')}</span> baixo(s) — cartas que cobrem isso ganham boost no score
          </p>
        )}
      </div>

      {topTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-arena-border-soft flex-shrink-0">
          {topTags.map(([name, count]) => {
            const active = selectedTags.has(name)
            return (
              <button
                key={name}
                onClick={() => toggleTag(name)}
                className={`chip !text-[10px] transition-all cursor-pointer ${active ? '!rounded-full font-semibold ring-1 ring-arena-gold' : 'hover:brightness-125 opacity-80'}`}
                style={tagChipStyle(name)}
                title={active ? 'Clique para remover do filtro' : 'Clique para filtrar só por esta tag'}
              >
                {name} <span className="opacity-60">×{count}</span>
              </button>
            )
          })}
          {selectedTags.size > 0 && (
            <button
              onClick={() => setSelectedTags(new Set())}
              className="text-[10px] text-arena-muted hover:text-arena-gold underline ml-1"
            >
              limpar filtro
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-6 h-6 border-2 border-arena-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-arena-muted text-xs">Calculando sinergias...</p>
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

        {!loading && !error && !data?.reason && suggestions.length === 0 && (
          <div className="text-arena-muted text-xs text-center p-4">
            Nenhuma carta na coleção compartilha tags com este deck.
          </div>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <div className="space-y-1.5">
            {suggestions.map(card => (
              <CandidateCard key={card.id} card={card} deckId={deckId} onAdd={onAdd} onHover={onHover} />
            ))}
            {data?.suggestions?.length >= limit && (
              <button
                onClick={() => setLimit(l => l + 30)}
                className="w-full text-center text-xs text-arena-muted hover:text-arena-gold transition-colors py-2"
              >
                + mostrar mais
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
