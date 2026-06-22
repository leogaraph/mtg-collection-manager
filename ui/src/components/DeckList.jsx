import { useState } from 'react'
import { ManaPips } from './ManaPips'
import { CardImage } from './CardImage'
import { TYPE_ORDER, TYPE_ICONS, getTypeGroup } from '../utils/mana'
import { api } from '../api'

const RARITY_DOT = { common: '#9aacb8', uncommon: '#b0c8d8', rare: '#c89b3c', mythic: '#e8683a', special: '#c084fc' }

function CardRow({ card, deckId, onUpdate, onHover }) {
  async function changeQty(delta) {
    const newQty = (card.quantity || 1) + delta
    if (newQty < 0) return
    await api.updateDeckCard(deckId, card.id, { quantity: newQty })
    onUpdate()
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-arena-border/30 group card-hover cursor-default"
      onMouseEnter={e => onHover(card, e)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Rarity dot */}
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: RARITY_DOT[card.rarity] || '#9aacb8' }}
      />

      {/* Qty controls */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => changeQty(-1)}
          className="w-4 h-4 rounded text-arena-muted hover:text-arena-gold hover:bg-arena-border text-xs leading-none"
        >−</button>
        <span className="text-arena-gold font-semibold text-xs w-4 text-center">{card.quantity || 1}</span>
        <button
          onClick={() => changeQty(1)}
          className="w-4 h-4 rounded text-arena-muted hover:text-arena-gold hover:bg-arena-border text-xs leading-none"
        >+</button>
      </div>

      {/* Qty static (when not hovered) */}
      <span className="text-arena-gold font-semibold text-xs w-4 text-center group-hover:hidden">
        {card.quantity || 1}
      </span>

      {/* Card name */}
      <span className="text-arena-text text-sm flex-1 truncate">{card.name}</span>

      {/* Mana cost */}
      <ManaPips cost={card.mana_cost} />
    </div>
  )
}

function TypeGroup({ type, cards, deckId, onUpdate, onHover, viewMode }) {
  const [collapsed, setCollapsed] = useState(false)
  const total = cards.reduce((s, c) => s + (c.quantity || 1), 0)

  if (viewMode === 'visual') {
    return (
      <div className="mb-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="type-header w-full flex items-center gap-2 px-3 py-1.5 rounded mb-2"
        >
          <span className="text-base">{TYPE_ICONS[type]}</span>
          <span className="text-arena-gold font-semibold text-sm">{type}</span>
          <span className="text-arena-muted text-xs ml-auto">{total}</span>
          <svg className={`w-3 h-3 text-arena-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="flex flex-wrap gap-2 px-1">
            {cards.map(card => (
              <div
                key={card.id}
                className="relative cursor-pointer"
                style={{ width: 80 }}
                onMouseEnter={e => onHover(card, e)}
                onMouseLeave={() => onHover(null)}
              >
                <CardImage card={card} className="w-full rounded shadow" />
                {(card.quantity || 1) > 1 && (
                  <span className="absolute bottom-1 right-1 bg-arena-bg text-arena-gold text-xs font-bold rounded px-1 shadow">
                    ×{card.quantity}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="type-header w-full flex items-center gap-2 px-3 py-1.5 rounded mb-1"
      >
        <span className="text-base">{TYPE_ICONS[type]}</span>
        <span className="text-arena-gold font-semibold text-sm">{type}</span>
        <span className="ml-1 bg-arena-border text-arena-muted text-xs rounded-full px-1.5 py-0.5">{total}</span>
        <svg className={`w-3 h-3 text-arena-muted ml-auto transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <div>
          {cards.map(card => (
            <CardRow
              key={card.id}
              card={card}
              deckId={deckId}
              onUpdate={onUpdate}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DeckList({ grouped = {}, deckId, onUpdate, onHover, viewMode = 'text', board = 'main' }) {
  const boardData = grouped[board] || {}

  return (
    <div className="space-y-1">
      {TYPE_ORDER.filter(t => boardData[t]?.length).map(type => (
        <TypeGroup
          key={type}
          type={type}
          cards={boardData[type]}
          deckId={deckId}
          onUpdate={onUpdate}
          onHover={onHover}
          viewMode={viewMode}
        />
      ))}
    </div>
  )
}
