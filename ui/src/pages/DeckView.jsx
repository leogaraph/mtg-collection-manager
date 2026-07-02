import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { DeckList } from '../components/DeckList'
import { CardTooltip } from '../components/CardTooltip'
import { ManaCurve } from '../components/ManaCurve'
import { ColorDistribution } from '../components/ColorDistribution'
import { AddCardSearch } from '../components/AddCardSearch'
import { CardImage } from '../components/CardImage'
import { ManaPips } from '../components/ManaPips'
import { SuggestionsPanel } from '../components/SuggestionsPanel'
import { TagSuggestionsPanel } from '../components/TagSuggestionsPanel'
import { DeckDoctor } from '../components/DeckDoctor'
import { GoldfishSimulator } from '../components/GoldfishSimulator'

const FORMAT_BADGE = {
  commander: { label: 'Commander', color: 'bg-purple-900/60 text-purple-300 border-purple-700' },
  standard:  { label: 'Standard',  color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  modern:    { label: 'Modern',    color: 'bg-green-900/60 text-green-300 border-green-700' },
  pioneer:   { label: 'Pioneer',   color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  legacy:    { label: 'Legacy',    color: 'bg-red-900/60 text-red-300 border-red-700' },
}

export function DeckView({ deckId, onBack }) {
  const [deck, setDeck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('text')  // text | visual
  const [board, setBoard] = useState('main')
  const [tooltip, setTooltip] = useState({ visible: false, card: null, x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)
  const [exportText, setExportText] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [showGoldfish, setShowGoldfish] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.deck(deckId)
    setDeck(data)
    setLoading(false)
  }, [deckId])

  useEffect(() => { load() }, [load])

  function handleHover(card, e) {
    if (!card) { setTooltip(t => ({ ...t, visible: false })); return }
    setTooltip({ visible: true, card, x: e.clientX, y: e.clientY })
  }

  async function handleExport() {
    setExporting(true)
    const text = await api.exportDeck(deckId)
    setExportText(text)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-arena-gold animate-pulse text-lg">Loading deck...</div>
    </div>
  )
  if (!deck) return <div className="text-arena-muted p-8">Deck not found.</div>

  const stats = deck.stats || {}
  const mainCount = (deck.cards || []).filter(c => c.board === 'main').reduce((s, c) => s + (c.quantity || 1), 0)
  const fmt = FORMAT_BADGE[deck.format] || FORMAT_BADGE.commander

  const boards = [...new Set((deck.cards || []).map(c => c.board))].filter(Boolean)

  return (
    <div className="flex flex-col min-h-screen md:h-[calc(100vh-4rem)] md:overflow-hidden bg-arena-bg">
      <CardTooltip {...tooltip} />

      {/* ── HEADER ── */}
      <header className="bg-arena-panel border-b border-arena-border px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-4 flex-shrink-0 flex-wrap gap-y-2">
        <button
          onClick={onBack}
          className="text-arena-muted hover:text-arena-gold transition-colors flex items-center gap-1 text-sm flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Decks
        </button>

        <div className="w-px h-5 bg-arena-border hidden sm:block" />

        <h1 className="text-arena-text font-semibold text-base sm:text-lg truncate min-w-0 flex-1 sm:flex-none">{deck.name || deck.slug}</h1>

        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${fmt.color}`}>
          {fmt.label}
        </span>

        <span className="text-arena-muted text-sm sm:ml-auto flex-shrink-0">
          {mainCount} <span className="text-arena-muted/60">cards</span>
        </span>

        {stats.totalPrice > 0 && (
          <span className="text-arena-gold text-sm font-semibold">
            ${stats.totalPrice}
          </span>
        )}

        {/* View toggles */}
        <div className="flex bg-arena-card rounded-lg p-0.5 gap-0.5 border border-arena-border">
          {[['text','☰ List'],['visual','⊞ Visual']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === m
                  ? 'bg-arena-gold text-arena-bg'
                  : 'text-arena-muted hover:text-arena-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Suggestions toggle */}
        <button
          onClick={() => { setShowSuggestions(s => !s); setShowTagSuggestions(false) }}
          className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${
            showSuggestions
              ? 'bg-arena-gold/20 text-arena-gold border-arena-gold/50'
              : 'text-arena-muted hover:text-arena-gold border-arena-border hover:border-arena-gold/50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Sugestões
        </button>

        {/* Tag suggestions toggle */}
        <button
          onClick={() => { setShowTagSuggestions(s => !s); setShowSuggestions(false) }}
          className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${
            showTagSuggestions
              ? 'bg-arena-gold/20 text-arena-gold border-arena-gold/50'
              : 'text-arena-muted hover:text-arena-gold border-arena-border hover:border-arena-gold/50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5.586a1 1 0 01.707.293l6.414 6.414a1 1 0 010 1.414l-7.586 7.586a1 1 0 01-1.414 0l-6.414-6.414A1 1 0 013 11.586V6a3 3 0 013-3z" />
          </svg>
          Por tags
        </button>

        {/* Goldfish toggle */}
        <button
          onClick={() => setShowGoldfish(s => !s)}
          className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${
            showGoldfish
              ? 'bg-arena-gold/20 text-arena-gold border-arena-gold/50'
              : 'text-arena-muted hover:text-arena-gold border-arena-border hover:border-arena-gold/50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17H7A2 2 0 015 15V9a2 2 0 012-2h2m4 0h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m-4-7h4" />
          </svg>
          Testar mão
        </button>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Arena
        </button>
      </header>

      <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">

        {/* ── SIDEBAR LEFT: Commander + Stats ── */}
        <aside className="w-full md:w-64 bg-arena-panel border-b md:border-b-0 md:border-r border-arena-border flex flex-col md:flex-shrink-0 md:overflow-y-auto">

          {/* Commander card */}
          {deck.commander_image ? (
            <div className="p-3">
              <p className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">Commander</p>
              <CardImage
                card={{ image_uri: deck.commander_image, name: deck.commander_name }}
                className="w-full max-w-[200px] md:max-w-none mx-auto rounded-lg shadow-card"
              />
              <p className="text-arena-text text-xs font-medium mt-1.5 text-center">{deck.commander_name}</p>
            </div>
          ) : (
            <div className="p-3">
              <p className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">Commander</p>
              <div className="bg-arena-card rounded-lg aspect-[5/7] flex items-center justify-center border border-dashed border-arena-border">
                <span className="text-arena-muted text-xs text-center px-2">Sem commander definido</span>
              </div>
            </div>
          )}

          <div className="border-t border-arena-border p-3 space-y-4">
            {deck.analysis && (
              <>
                <DeckDoctor analysis={deck.analysis} />
                <div className="border-t border-arena-border-soft" />
              </>
            )}
            <ManaCurve curve={stats.curve} />
            <ColorDistribution colors={stats.colors} />

            {/* Type breakdown */}
            {stats.types && Object.keys(stats.types).length > 0 && (
              <div>
                <h3 className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">Types</h3>
                <div className="space-y-1">
                  {Object.entries(stats.types)
                    .sort(([,a],[,b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-arena-muted">{type}</span>
                        <span className="text-arena-text font-medium">{count}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN: Deck cards ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4">

            {/* Add card */}
            <div className="mb-4">
              <AddCardSearch
                deckId={deck.id}
                colorIdentity={deck.commander_color_identity || deck.commander_colors || ''}
                onAdd={load}
              />
            </div>

            {/* Board tabs */}
            {boards.length > 1 && (
              <div className="flex gap-1 mb-4 bg-arena-card rounded-lg p-1 border border-arena-border w-fit">
                {boards.map(b => (
                  <button
                    key={b}
                    onClick={() => setBoard(b)}
                    className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                      board === b
                        ? 'bg-arena-gold text-arena-bg'
                        : 'text-arena-muted hover:text-arena-text'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}

            {/* Goldfish simulator */}
            {showGoldfish && (
              <div className="panel p-4 mb-4">
                <h3 className="text-arena-gold text-sm font-semibold mb-3">Testar mão (goldfish)</h3>
                <GoldfishSimulator deckCards={deck.cards} onHover={handleHover} />
              </div>
            )}

            {/* Card list */}
            <DeckList
              grouped={deck.grouped}
              deckId={deck.id}
              onUpdate={load}
              onHover={handleHover}
              viewMode={viewMode}
              board={board}
            />
          </div>
        </main>

        {/* ── SIDEBAR RIGHT: Suggestions ── */}
        {showSuggestions && (
          <aside className="w-full md:w-80 bg-arena-panel border-t md:border-t-0 md:border-l border-arena-border flex flex-col md:flex-shrink-0 md:overflow-hidden max-h-[80vh] md:max-h-none">
            <SuggestionsPanel
              deckId={deck.id}
              commanderName={deck.commander_name}
              onAdd={load}
              onHover={handleHover}
            />
          </aside>
        )}
        {showTagSuggestions && (
          <aside className="w-full md:w-80 bg-arena-panel border-t md:border-t-0 md:border-l border-arena-border flex flex-col md:flex-shrink-0 md:overflow-hidden max-h-[80vh] md:max-h-none">
            <TagSuggestionsPanel
              deckId={deck.id}
              onAdd={load}
              onHover={handleHover}
            />
          </aside>
        )}
      </div>

      {/* ── Export Modal ── */}
      {exporting && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setExporting(false)}>
          <div className="bg-arena-panel border border-arena-border rounded-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-arena-gold font-semibold">Export — Arena Format</h2>
              <button onClick={() => setExporting(false)} className="text-arena-muted hover:text-arena-text text-xl leading-none">×</button>
            </div>
            <textarea
              readOnly
              value={exportText}
              className="w-full h-64 bg-arena-bg border border-arena-border rounded-lg p-3 text-arena-text text-xs font-mono resize-none outline-none"
            />
            <button
              onClick={() => { navigator.clipboard.writeText(exportText); setExporting(false) }}
              className="mt-3 w-full bg-arena-gold hover:bg-arena-gold-light text-arena-bg font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              Copiar para Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
