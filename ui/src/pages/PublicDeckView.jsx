import { useState, useEffect } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'
import { CardTooltip } from '../components/CardTooltip'
import { ManaPips } from '../components/ManaPips'
import { ManaCurve } from '../components/ManaCurve'
import { ColorDistribution } from '../components/ColorDistribution'
import { DeckDoctor } from '../components/DeckDoctor'
import { TYPE_ORDER, TYPE_ICONS } from '../utils/mana'

const FORMAT_BADGE = {
  commander: { label: 'Commander', color: 'bg-purple-900/60 text-purple-300 border-purple-700' },
  standard:  { label: 'Standard',  color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  modern:    { label: 'Modern',    color: 'bg-green-900/60 text-green-300 border-green-700' },
  pioneer:   { label: 'Pioneer',   color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  legacy:    { label: 'Legacy',    color: 'bg-red-900/60 text-red-300 border-red-700' },
}

// Linha de carta somente-leitura — sem os controles de +/- quantidade do
// DeckList (que chamam a API autenticada de edição de deck_cards).
function ReadOnlyCardRow({ card, onHover }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-arena-border/30"
      onMouseEnter={e => onHover(card, e)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="text-arena-gold font-semibold text-xs w-5 text-center flex-shrink-0">{card.quantity || 1}</span>
      <span className="text-arena-text text-sm flex-1 truncate">{card.name}</span>
      <ManaPips cost={card.mana_cost} />
    </div>
  )
}

export function PublicDeckView({ deckId, onBack, onLoginClick, loggedIn }) {
  const [deck, setDeck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [board, setBoard] = useState('main')
  const [tooltip, setTooltip] = useState({ visible: false, card: null, x: 0, y: 0 })

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.publicDeck(deckId)
      .then(setDeck)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [deckId])

  function handleHover(card, e) {
    if (!card) { setTooltip(t => ({ ...t, visible: false })); return }
    setTooltip({ visible: true, card, x: e.clientX, y: e.clientY })
  }

  const fmt = FORMAT_BADGE[deck?.format] || FORMAT_BADGE.commander
  const boards = deck ? Object.keys(deck.grouped || {}) : []
  const boardData = deck?.grouped?.[board] || {}

  return (
    <div className="min-h-screen bg-arena-bg">
      <CardTooltip {...tooltip} />

      <header className="bg-arena-panel border-b border-arena-border px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="text-arena-muted hover:text-arena-gold transition-colors flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Decks públicos
        </button>
        <div className="w-px h-5 bg-arena-border" />
        <img src="/logo.png" alt="Mana Vault" className="w-6 h-6 rounded object-cover" />
        <span className="text-arena-parchment font-display font-semibold text-sm hidden sm:inline">Mana Vault</span>
        <button onClick={onLoginClick} className="ml-auto btn-ghost !text-xs !py-1.5">
          {loggedIn ? 'Ir para o app' : 'Entrar'}
        </button>
      </header>

      {loading && <div className="text-arena-gold text-center animate-pulse py-20">Carregando deck...</div>}
      {error && <div className="text-arena-muted text-center py-20">Deck não encontrado.</div>}

      {deck && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <aside className="w-full md:w-64 flex-shrink-0 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-arena-text font-bold text-lg leading-tight">{deck.name || deck.slug}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fmt.color}`}>{fmt.label}</span>
              </div>
              <p className="text-arena-muted text-xs">
                por <span className="text-arena-text-dim">{deck.owner_name || 'alguém'}</span>
              </p>
            </div>

            {deck.commander_image && (
              <div>
                <p className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">Commander</p>
                <CardImage card={{ image_uri: deck.commander_image, name: deck.commander_name }} className="w-full max-w-[200px] mx-auto rounded-lg shadow-card" />
                <p className="text-arena-text text-xs font-medium mt-1.5 text-center">{deck.commander_name}</p>
              </div>
            )}

            {deck.analysis && <DeckDoctor analysis={deck.analysis} />}
            <ManaCurve curve={deck.stats?.curve} />
            <ColorDistribution colors={deck.stats?.colors} />
          </aside>

          {/* Card list */}
          <main className="flex-1 min-w-0">
            {boards.length > 1 && (
              <div className="flex gap-1 mb-4 bg-arena-card rounded-lg p-1 border border-arena-border w-fit">
                {boards.map(b => (
                  <button
                    key={b}
                    onClick={() => setBoard(b)}
                    className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${board === b ? 'bg-arena-gold text-arena-bg' : 'text-arena-muted hover:text-arena-text'}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {TYPE_ORDER.filter(t => boardData[t]?.length).map(type => (
                <div key={type}>
                  <div className="type-header w-full flex items-center gap-2 px-3 py-1.5 rounded mb-1">
                    <span className="text-base">{TYPE_ICONS[type]}</span>
                    <span className="text-arena-gold font-semibold text-sm">{type}</span>
                    <span className="ml-1 bg-arena-border text-arena-muted text-xs rounded-full px-1.5 py-0.5">
                      {boardData[type].reduce((s, c) => s + (c.quantity || 1), 0)}
                    </span>
                  </div>
                  {boardData[type].map(card => (
                    <ReadOnlyCardRow key={card.id} card={card} onHover={handleHover} />
                  ))}
                </div>
              ))}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
