import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { ManaPips } from './ManaPips'
import { CardImage } from './CardImage'

const COLOR_HEX = { W: '#f0ede0', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f' }
const COLOR_LABEL = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

function ColorPip({ color }) {
  return (
    <span
      title={COLOR_LABEL[color]}
      className="mana-pip flex-shrink-0"
      style={{ background: COLOR_HEX[color], color: color === 'W' ? '#333' : '#fff', width: 14, height: 14, fontSize: 8 }}
    >
      {color}
    </span>
  )
}

export function AddCardSearch({ deckId, colorIdentity = '', onAdd }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [preview, setPreview] = useState(null)
  const [mode, setMode]       = useState('name')   // 'name' | 'text'
  const [loading, setLoading] = useState(false)
  const inputRef  = useRef()
  const debounceRef = useRef()

  const colors = colorIdentity ? colorIdentity.split(',').filter(Boolean) : []

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const data = await api.searchCards(query, {
        colorIdentity,
        mode,
      })
      setResults(data)
      setOpen(true)
      setLoading(false)
    }, 300)
  }, [query, mode, colorIdentity])

  async function handleAdd(card) {
    await api.addCardToDeck(deckId, { card_id: card.id, quantity: 1, board: 'main' })
    setQuery('')
    setResults([])
    setOpen(false)
    setPreview(null)
    onAdd?.()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setQuery(''); setOpen(false) }
  }

  const RARITY_DOT = { common: '#9aacb8', uncommon: '#b0c8d8', rare: '#c89b3c', mythic: '#e8683a' }

  return (
    <div className="relative">
      {/* ── Search bar ── */}
      <div className="flex items-center gap-2 bg-arena-card border border-arena-border rounded-xl px-3 py-2.5 focus-within:border-arena-gold transition-colors shadow-sm">

        {/* Search icon */}
        <svg className="w-4 h-4 text-arena-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {/* Input */}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setPreview(null) }, 180)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'name' ? 'Buscar por nome...' : 'Buscar por texto / mecânica...'}
          className="bg-transparent text-arena-text placeholder-arena-muted text-sm outline-none flex-1 min-w-0"
        />

        {/* Loading spinner */}
        {loading && (
          <svg className="w-3.5 h-3.5 text-arena-muted animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}

        {/* Clear */}
        {query && !loading && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            className="text-arena-muted hover:text-arena-text flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        <div className="w-px h-4 bg-arena-border flex-shrink-0" />

        {/* Mode toggle: Nome | Texto */}
        <div className="flex gap-0.5 bg-arena-bg rounded-lg p-0.5 flex-shrink-0">
          {[['name','Nome'],['text','Texto']].map(([m, label]) => (
            <button
              key={m}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setMode(m); inputRef.current?.focus() }}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                mode === m ? 'bg-arena-gold text-arena-bg' : 'text-arena-muted hover:text-arena-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Color identity badges */}
        {colors.length > 0 && (
          <>
            <div className="w-px h-4 bg-arena-border flex-shrink-0" />
            <div className="flex items-center gap-1 flex-shrink-0" title="Filtrado pela identidade de cor do commander">
              <svg className="w-3 h-3 text-arena-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <div className="flex gap-0.5">
                {colors.map(c => <ColorPip key={c} color={c} />)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-arena-card border border-arena-border rounded-xl shadow-hover z-40 overflow-hidden">
          <div className="flex">

            {/* Lista */}
            <div className="flex-1 max-h-80 overflow-y-auto divide-y divide-arena-border/30">
              {results.map(card => (
                <button
                  key={card.id}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setPreview(card)}
                  onMouseLeave={() => setPreview(null)}
                  onClick={() => handleAdd(card)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-arena-border/30 transition-colors text-left group"
                >
                  {/* Rarity dot */}
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: RARITY_DOT[card.rarity] || '#9aacb8' }}
                  />

                  <div className="flex-1 min-w-0">
                    {/* Nome com highlight da query */}
                    <p className="text-arena-text text-sm font-medium leading-tight truncate">
                      {highlightMatch(card.name, query)}
                    </p>
                    <p className="text-arena-muted text-xs truncate mt-0.5">{card.type_line}</p>

                    {/* Oracle text snippet em modo texto */}
                    {mode === 'text' && card.oracle_text && (
                      <p className="text-arena-muted/70 text-xs mt-0.5 line-clamp-1">
                        {snippetMatch(card.oracle_text, query)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ManaPips cost={card.mana_cost} />
                    {/* Color identity pills */}
                    {card.color_identity && (
                      <div className="flex gap-0.5">
                        {card.color_identity.split(',').filter(Boolean).map(c => (
                          <ColorPip key={c} color={c} />
                        ))}
                      </div>
                    )}
                    {/* Add icon on hover */}
                    <svg className="w-4 h-4 text-arena-gold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview da imagem */}
            {preview && (
              <div className="w-36 p-2 border-l border-arena-border flex-shrink-0 flex flex-col gap-1">
                <CardImage card={preview} className="w-full rounded-lg" />
                {(preview.power || preview.loyalty) && (
                  <p className="text-arena-gold text-xs font-bold text-center">
                    {preview.power ? `${preview.power}/${preview.toughness}` : `◆ ${preview.loyalty}`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer: contagem */}
          <div className="border-t border-arena-border/50 px-3 py-1.5 flex items-center justify-between">
            <span className="text-arena-muted text-xs">
              {results.length} resultado{results.length !== 1 ? 's' : ''}
              {colors.length > 0 && <span className="ml-1 text-arena-muted/60">· filtrado por identidade de cor</span>}
            </span>
            <span className="text-arena-muted/50 text-xs">↵ adicionar · Esc fechar</span>
          </div>
        </div>
      )}

      {/* Sem resultados */}
      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-arena-card border border-arena-border rounded-xl shadow-hover z-40 px-4 py-3 text-arena-muted text-sm">
          Nenhuma carta encontrada
          {colors.length > 0 && <span className="text-xs"> dentro da identidade de cor do commander</span>}
        </div>
      )}
    </div>
  )
}

// Destaca o trecho que casou com a query
function highlightMatch(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-arena-gold font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

// Extrai um trecho do oracle text em torno do match
function snippetMatch(text, query) {
  if (!query || !text) return ''
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 80) + '…'
  const start = Math.max(0, idx - 20)
  const end   = Math.min(text.length, idx + query.length + 60)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}
