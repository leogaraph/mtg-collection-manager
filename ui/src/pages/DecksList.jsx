import { useState, useEffect } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'
import { ImportDeckModal } from '../components/ImportDeckModal'
import { SyncButton } from '../components/SyncButton'

const COLOR_DOT = { W:'#f0ede0', U:'#4e9bcd', B:'#8b7bb5', R:'#e35d4a', G:'#5a9e6f' }
const PLATFORMS = ['arena', 'mtgo', 'physical', 'all']
const PLATFORM_LABEL = { arena: '🖥 Arena', mtgo: '🖥 MTGO', physical: '📦 Física', all: '🌐 Todas' }

function DeckCard({ deck, onClick, onChanged, selectMode, selected, onToggleSelect }) {
  const colors = (deck.color_identity || deck.commander_colors || '').split(',').filter(Boolean)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(deck.name || deck.slug)

  const saveName = async () => {
    setRenaming(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === (deck.name || deck.slug)) { setName(deck.name || deck.slug); return }
    await api.updateDeck(deck.id, { name: trimmed })
    onChanged?.()
  }

  const setPlatform = async (platform) => {
    setMenuOpen(false)
    await api.updateDeck(deck.id, { platform })
    onChanged?.()
  }

  const duplicate = async (e) => {
    e.stopPropagation()
    setMenuOpen(false)
    await api.duplicateDeck(deck.id)
    onChanged?.()
  }

  const remove = async (e) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (!confirm(`Excluir o deck "${deck.name || deck.slug}"?`)) return
    await api.deleteDeck(deck.id)
    onChanged?.()
  }

  return (
    <div
      onClick={selectMode ? onToggleSelect : onClick}
      className={`relative bg-arena-card border rounded-xl hover:shadow-glow transition-all text-left group cursor-pointer ${menuOpen ? 'overflow-visible' : 'overflow-hidden'} ${selected ? 'border-arena-gold ring-2 ring-arena-gold/50' : 'border-arena-border hover:border-arena-gold/60'}`}
    >
      {selectMode && (
        <div className="absolute top-1.5 left-1.5 z-20 w-5 h-5 rounded border-2 border-arena-gold bg-black/60 flex items-center justify-center">
          {selected && <span className="text-arena-gold text-xs leading-none">✓</span>}
        </div>
      )}
      {/* Commander art as background */}
      <div className="relative h-36 overflow-hidden bg-arena-ink rounded-t-xl">
        {deck.commander_image ? (
          <CardImage
            card={{ image_uri: deck.commander_image }}
            className="w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-700"
            style={{ objectPosition: '50% 18%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-arena-panel to-arena-ink">
            <span className="text-4xl opacity-20">⚔️</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-arena-card via-arena-card/30 to-transparent" />

        {/* Platform badge */}
        <span className={`absolute top-2 left-2 backdrop-blur-sm bg-black/50 text-arena-text-dim text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/10 ${selectMode ? 'hidden' : ''}`}>
          {PLATFORM_LABEL[deck.platform] || deck.platform}
        </span>

        {/* Menu button */}
        {!selectMode && (
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-black/80 text-arena-muted hover:text-arena-gold rounded transition-colors"
          >
            ⋮
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-9 right-1.5 bg-arena-panel border border-arena-border rounded-lg shadow-lg z-20 text-xs w-40 overflow-hidden"
        >
          <button
            onClick={() => { setMenuOpen(false); setRenaming(true) }}
            className="w-full text-left px-3 py-2 text-arena-text hover:bg-arena-bg transition-colors"
          >
            ✏️ Renomear
          </button>
          <button
            onClick={duplicate}
            className="w-full text-left px-3 py-2 text-arena-text hover:bg-arena-bg transition-colors"
          >
            📋 Duplicar
          </button>
          <div className="border-t border-arena-border" />
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-arena-muted">Plataforma</p>
          {PLATFORMS.map(p => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`w-full text-left px-3 py-1.5 hover:bg-arena-bg transition-colors ${deck.platform === p ? 'text-arena-gold' : 'text-arena-text'}`}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
          <div className="border-t border-arena-border" />
          <button
            onClick={remove}
            className="w-full text-left px-3 py-2 text-red-400 hover:bg-arena-bg transition-colors"
          >
            🗑️ Excluir
          </button>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setName(deck.name || deck.slug); setRenaming(false) } }}
              className="bg-arena-ink border border-arena-gold rounded px-1.5 py-0.5 text-arena-text font-semibold text-sm leading-tight outline-none flex-1 min-w-0"
            />
          ) : (
            <h3 className="text-arena-text font-semibold text-sm leading-tight truncate group-hover:text-arena-gold transition-colors">{deck.name || deck.slug}</h3>
          )}
          {/* Color pips */}
          <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
            {colors.map(c => (
              <span key={c} className="w-3 h-3 rounded-full ring-1 ring-black/30" style={{ background: COLOR_DOT[c] || '#9aacb8' }} />
            ))}
          </div>
        </div>

        {deck.commander_name && (
          <p className="text-arena-muted text-xs truncate mb-2">{deck.commander_name}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-arena-border-soft">
          <span className="text-arena-text-dim text-[10px] capitalize">{deck.format}</span>
          <span className="text-arena-muted text-[11px] font-medium">{deck.card_count || 0} cards</span>
        </div>
      </div>
    </div>
  )
}

export function DecksList({ onSelectDeck }) {
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const [loadError, setLoadError] = useState(null)
  const reload = () => api.decks()
    .then(d => { setDecks(Array.isArray(d) ? d : []); setLoading(false); setLoadError(null) })
    .catch(e => { setLoading(false); setLoadError(e.message || 'Falha ao carregar decks') })

  useEffect(() => {
    reload()
  }, [])

  const filtered = decks.filter(d =>
    !filter || (d.name || d.slug).toLowerCase().includes(filter.toLowerCase())
  )

  const toggleSelectMode = () => {
    setSelectMode(m => !m)
    setSelected(new Set())
  }

  const toggleSelect = (id) => {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Excluir ${selected.size} deck(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return
    await Promise.all([...selected].map(id => api.deleteDeck(id)))
    setSelected(new Set())
    setSelectMode(false)
    reload()
  }

  const totalEntries = decks.reduce((s, d) => s + (d.card_count || 0), 0)

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
          <div>
            <h2 className="font-display text-arena-parchment text-2xl font-bold leading-none">Seus Decks</h2>
            <p className="text-arena-muted text-sm mt-1.5">
              <span className="text-arena-gold font-semibold">{decks.length}</span> decks
              <span className="text-arena-border-soft mx-2">•</span>
              <span className="text-arena-gold font-semibold">{totalEntries}</span> entradas
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SyncButton />
            <button onClick={toggleSelectMode} className={selectMode ? 'btn-gold' : 'btn-ghost'}>
              {selectMode ? 'Cancelar' : 'Selecionar'}
            </button>
            <button onClick={() => setShowImport(true)} className="btn-gold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
              </svg>
              Importar
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 input max-w-sm">
          <svg className="w-4 h-4 text-arena-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar decks..."
            className="bg-transparent text-arena-text placeholder-arena-muted text-sm outline-none flex-1"
          />
        </div>

        {selectMode && (
          <div className="flex items-center gap-3 mt-3 panel px-4 py-2.5">
            <span className="text-xs text-arena-muted">{selected.size} selecionado(s)</span>
            <button
              onClick={() => setSelected(new Set(filtered.map(d => d.id)))}
              className="text-xs text-arena-muted hover:text-arena-gold transition-colors"
            >
              Selecionar todos
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-arena-muted hover:text-arena-gold transition-colors"
            >
              Limpar
            </button>
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className="ml-auto text-xs text-red-400 border border-red-400/40 hover:bg-red-400/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🗑️ Excluir selecionados
            </button>
          </div>
        )}
      </div>

      {showImport && (
        <ImportDeckModal
          onClose={() => setShowImport(false)}
          onImported={reload}
        />
      )}

      {/* Deck grid */}
      <div className="max-w-7xl mx-auto px-6 pb-10">
        {loading ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando decks...</div>
        ) : loadError ? (
          <div className="text-arena-red text-center py-20">
            <p className="font-medium">Não foi possível carregar os decks.</p>
            <p className="text-arena-muted text-sm mt-1">{loadError}</p>
            <button onClick={() => { setLoading(true); reload() }} className="btn-ghost mt-4">Tentar de novo</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhum deck encontrado.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(deck => (
              <DeckCard
                key={deck.id}
                deck={deck}
                onClick={() => onSelectDeck(deck)}
                onChanged={reload}
                selectMode={selectMode}
                selected={selected.has(deck.id)}
                onToggleSelect={() => toggleSelect(deck.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
