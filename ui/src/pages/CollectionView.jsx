import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'
import { ManaPips } from '../components/ManaPips'
import { tagStyle, tagChipStyle } from '../utils/tags'

function TagChip({ name, meta, onRemove }) {
  const { icon } = tagStyle(name, meta)
  return (
    <span className="chip" style={tagChipStyle(name, meta)}>
      {icon && <span className="leading-none">{icon}</span>}
      {name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100 leading-none" title="Remover tag">×</button>
      )}
    </span>
  )
}

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
const COLOR_LABEL = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', C: 'Incolor' }

const SORTS = [
  { value: 'name',    label: 'Nome (A-Z)' },
  { value: '-cmc',    label: 'CMC (maior primeiro)' },
  { value: 'cmc',     label: 'CMC (menor primeiro)' },
  { value: '-price',  label: 'Preço (maior primeiro)' },
  { value: 'price',   label: 'Preço (menor primeiro)' },
  { value: '-edhrec', label: 'EDHREC rank (mais popular)' },
]

const PAGE_SIZE = 60

function CardTile({ card, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-arena-card border border-arena-border rounded-lg overflow-hidden hover:border-arena-gold/60 hover:shadow-glow transition-all text-left group flex flex-col"
    >
      <div className="relative aspect-[5/7] bg-arena-bg overflow-hidden">
        <CardImage card={card} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        {card.price_usd && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-arena-gold text-[10px] font-semibold px-1.5 py-0.5 rounded">
            ${Number(card.price_usd).toFixed(2)}
          </span>
        )}
        {(card.qty_digital > 0 || card.qty_physical > 0) && (
          <div className="absolute top-1 right-1 flex flex-col gap-0.5 items-end">
            {card.qty_digital > 0 && (
              <span className="bg-arena-blue/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded" title="Coleção digital (Arena/MTGO)">
                🖥 {card.qty_digital}
              </span>
            )}
            {card.qty_physical > 0 && (
              <span className="bg-emerald-700/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded" title="Coleção física">
                📦 {card.qty_physical}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="p-2 flex-1 flex flex-col gap-1">
        <p className="text-arena-text text-xs font-medium leading-tight line-clamp-2">{card.name}</p>
        <div className="flex items-center justify-between gap-1 mt-auto">
          <ManaPips cost={card.mana_cost} />
          <span className={`rarity-${card.rarity} text-[10px] capitalize flex-shrink-0`}>{card.rarity}</span>
        </div>
        {card.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map(t => (
              <span key={t} className="chip !text-[9px] !px-1.5 !py-0.5" style={tagChipStyle(t)}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG']
const FINISHES = ['nonfoil', 'foil', 'etched']

function PhysicalEditor({ card, onUpdated }) {
  const [quantity, setQuantity] = useState(card.qty_physical || 0)
  const [condition, setCondition] = useState('NM')
  const [finish, setFinish] = useState('nonfoil')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setQuantity(card.qty_physical || 0)
  }, [card.id])

  const save = async (newQty) => {
    setSaving(true)
    try {
      await api.setPhysical({ card_id: card.id, quantity: newQty, condition, finish })
      setQuantity(newQty)
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-arena-border rounded-lg p-2.5 mb-2">
      <p className="text-arena-muted text-[10px] uppercase tracking-widest mb-1.5">Coleção física 📦</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => save(Math.max(0, quantity - 1))}
            disabled={saving || quantity <= 0}
            className="w-6 h-6 flex items-center justify-center bg-arena-bg border border-arena-border rounded text-arena-muted hover:text-arena-gold disabled:opacity-40"
          >−</button>
          <span className="text-arena-text text-sm w-6 text-center">{quantity}</span>
          <button
            onClick={() => save(quantity + 1)}
            disabled={saving}
            className="w-6 h-6 flex items-center justify-center bg-arena-bg border border-arena-border rounded text-arena-muted hover:text-arena-gold disabled:opacity-40"
          >+</button>
        </div>

        <select value={condition} onChange={e => setCondition(e.target.value)} className="bg-arena-bg border border-arena-border rounded px-1.5 py-1 text-arena-text text-xs outline-none">
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={finish} onChange={e => setFinish(e.target.value)} className="bg-arena-bg border border-arena-border rounded px-1.5 py-1 text-arena-text text-xs outline-none capitalize">
          {FINISHES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {quantity > 0 && (
          <button
            onClick={() => save(quantity)}
            disabled={saving}
            className="text-[11px] text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded px-2 py-1 transition-colors"
          >
            atualizar
          </button>
        )}
      </div>
    </div>
  )
}

function TagEditor({ card, allTags, onUpdated }) {
  const [tags, setTags] = useState(card.tags || [])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setTags(card.tags || []) }, [card.id])

  async function addTag(name) {
    name = name.trim().toLowerCase().replace(/^#/, '')
    if (!name || tags.includes(name)) return
    setSaving(true)
    try {
      const res = await api.addTag(card.id, name)
      setTags(res.tags || [...tags, name])
      setInput('')
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  async function removeTag(name) {
    setSaving(true)
    try {
      const res = await api.removeTag(card.id, name)
      setTags(res.tags || tags.filter(t => t !== name))
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  const tagMeta = Object.fromEntries((allTags || []).map(t => [t.name, t]))

  return (
    <div className="mb-3">
      <p className="eyebrow mb-1.5">Tags</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(t => (
          <TagChip key={t} name={t} meta={tagMeta[t]} onRemove={() => removeTag(t)} />
        ))}
        {tags.length === 0 && <span className="text-arena-muted/60 text-xs">Nenhuma tag ainda</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTag(input) }}
          placeholder="nova tag (ex: combo, favorita)"
          list="all-tags-list"
          disabled={saving}
          className="input !py-1.5 flex-1 max-w-[12rem]"
        />
        <button
          onClick={() => addTag(input)}
          disabled={saving || !input.trim()}
          className="btn-ghost !py-1.5"
        >
          + Adicionar
        </button>
        <datalist id="all-tags-list">
          {allTags.map(t => <option key={t.name} value={t.name} />)}
        </datalist>
      </div>
    </div>
  )
}

function CardDetailModal({ card, allTags, onClose, onUpdated }) {
  if (!card) return null
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="panel shadow-panel w-full max-w-2xl p-5 flex flex-col sm:flex-row gap-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardImage card={card} className="w-40 sm:w-56 flex-shrink-0 rounded-xl shadow-card self-center sm:self-start" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h2 className="font-display text-arena-parchment font-bold text-xl leading-tight">{card.name}</h2>
            <button onClick={onClose} className="text-arena-muted hover:text-arena-text text-xl leading-none flex-shrink-0">×</button>
          </div>
          <div className="mb-2"><ManaPips cost={card.mana_cost} size="lg" /></div>
          <p className="text-arena-muted text-sm mb-2">{card.type_line}</p>
          {card.oracle_text && (
            <p className="text-arena-text text-sm whitespace-pre-line mb-3">{card.oracle_text}</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-arena-muted mb-3">
            <span>Raridade: <span className={`rarity-${card.rarity} capitalize`}>{card.rarity}</span></span>
            <span>CMC: <span className="text-arena-text">{card.cmc ?? '—'}</span></span>
            <span>Set: <span className="text-arena-text uppercase">{card.set_code}</span></span>
            {card.price_usd && <span>Preço: <span className="text-arena-gold">${Number(card.price_usd).toFixed(2)}</span></span>}
            {card.power != null && <span>P/T: <span className="text-arena-text">{card.power}/{card.toughness}</span></span>}
            {card.loyalty != null && <span>Lealdade: <span className="text-arena-text">{card.loyalty}</span></span>}
            {card.qty_digital > 0 && <span>Digital: <span className="text-arena-blue">{card.qty_digital}</span></span>}
          </div>
          <PhysicalEditor card={card} onUpdated={onUpdated} />
          <TagEditor card={card} allTags={allTags} onUpdated={onUpdated} />
          {card.decks?.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">Em {card.decks.length} deck(s)</p>
              <div className="flex flex-wrap gap-1.5">
                {card.decks.map(d => (
                  <span key={d} className="chip bg-arena-blue/10 text-arena-blue border-arena-blue/30">{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CollectionView({ searchQuery, searchNonce }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [allTags, setAllTags] = useState([])
  const [selected, setSelected] = useState(null)

  // filters
  const [q, setQ] = useState('')
  const [colors, setColors] = useState(new Set())
  const [type, setType] = useState('')
  const [cmcMin, setCmcMin] = useState('')
  const [cmcMax, setCmcMax] = useState('')
  const [tags, setTags] = useState(new Set())
  const [owned, setOwned] = useState('')
  const [sort, setSort] = useState('name')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const [recomputing, setRecomputing] = useState(false)

  const refreshTags = useCallback(() => {
    api.tags().then(setAllTags).catch(() => {})
  }, [])

  useEffect(() => { refreshTags() }, [refreshTags])

  const recomputeAuto = async () => {
    setRecomputing(true)
    try {
      await api.recomputeAutoTags()
      refreshTags()
    } finally {
      setRecomputing(false)
    }
  }

  // recebe busca global do header (atalho "/")
  useEffect(() => {
    if (searchNonce) setQ(searchQuery || '')
  }, [searchNonce])

  const load = useCallback(() => {
    setLoading(true)
    const params = { meta: 1, limit, offset: 0, sort }
    if (q) params.q = q
    if (colors.size) params.color = [...colors].join(',')
    if (type) params.type = type
    if (cmcMin !== '') params.cmc_min = cmcMin
    if (cmcMax !== '') params.cmc_max = cmcMax
    if (tags.size) params.tags = [...tags].join(',')
    if (owned) params.owned = owned

    api.cards(params).then(res => {
      setItems(res.items || [])
      setTotal(res.total || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [q, colors, type, cmcMin, cmcMax, tags, owned, sort, limit])

  // debounce search/filters
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // reset pagination when filters change (not when limit itself changes)
  useEffect(() => { setLimit(PAGE_SIZE) }, [q, colors, type, cmcMin, cmcMax, tags, owned, sort])

  const toggleColor = (c) => {
    setColors(prev => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }

  const toggleTag = (t) => {
    setTags(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  const clearFilters = () => {
    setQ(''); setColors(new Set()); setType(''); setCmcMin(''); setCmcMax(''); setTags(new Set()); setOwned('')
  }

  const hasFilters = Boolean(q || colors.size || type || cmcMin !== '' || cmcMax !== '' || tags.size || owned)

  return (
    <div className="min-h-screen">
      {/* Filter bar */}
      <div className="bg-arena-bg/85 backdrop-blur-md border-b border-arena-border-soft px-6 py-4 sticky top-16 z-20">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Search + sort */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 input max-w-sm w-full">
              <svg className="w-4 h-4 text-arena-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar por nome ou texto..."
                className="bg-transparent text-arena-text placeholder-arena-muted text-sm outline-none flex-1"
              />
            </div>

            {/* Color pips */}
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  title={COLOR_LABEL[c]}
                  onClick={() => toggleColor(c)}
                  className={`mana-pip mana-${c} cursor-pointer transition-all ${colors.has(c) ? 'ring-2 ring-arena-gold scale-110' : 'opacity-40 hover:opacity-80'}`}
                  style={{ width: 24, height: 24, fontSize: 11 }}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Ownership filter */}
            <div className="seg">
              {[
                { value: '', label: 'Todas' },
                { value: 'digital', label: '🖥 Digital' },
                { value: 'physical', label: '📦 Física' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOwned(opt.value)}
                  className={`seg-btn ${owned === opt.value ? 'seg-btn-active' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Type */}
            <input
              value={type}
              onChange={e => setType(e.target.value)}
              placeholder="Tipo (ex: Creature)"
              className="input w-40"
            />

            {/* CMC range */}
            <div className="flex items-center gap-1.5">
              <input type="number" min="0" value={cmcMin} onChange={e => setCmcMin(e.target.value)} placeholder="CMC min" className="input w-24" />
              <span className="text-arena-muted text-xs">–</span>
              <input type="number" min="0" value={cmcMax} onChange={e => setCmcMax(e.target.value)} placeholder="CMC max" className="input w-24" />
            </div>

            {/* Sort */}
            <select value={sort} onChange={e => setSort(e.target.value)} className="input ml-auto cursor-pointer">
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            {/* Stats */}
            <div className="text-xs text-arena-muted whitespace-nowrap">
              <span className="text-arena-gold font-semibold text-sm">{total}</span> cartas
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1">Tags</span>
              {allTags.map(t => {
                const active = tags.has(t.name)
                const style = active ? {} : tagChipStyle(t.name, t)
                const { icon } = tagStyle(t.name, t)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    title={t.description || undefined}
                    className={`chip transition-all ${active ? 'seg-btn-active !rounded-full font-semibold' : 'hover:brightness-125'}`}
                    style={style}
                  >
                    {icon && <span className="leading-none">{icon}</span>}
                    {t.name} <span className="opacity-60">{t.card_count}</span>
                  </button>
                )
              })}
              <button
                onClick={recomputeAuto}
                disabled={recomputing}
                title="Recalcular as tags automáticas (staple = top EDHREC; meta = em 3+ dos seus decks)"
                className="text-[11px] text-arena-muted hover:text-arena-gold ml-1 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <svg className={`w-3 h-3 ${recomputing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {recomputing ? 'recalculando…' : 'recalcular staple/meta'}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="text-[11px] text-arena-muted hover:text-arena-gold ml-2 underline">
                  limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading && items.length === 0 ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando coleção...</div>
        ) : items.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhuma carta encontrada com esses filtros.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {items.map(card => (
                <CardTile key={card.id} card={card} onClick={() => setSelected(card)} />
              ))}
            </div>

            {items.length < total && (
              <div className="text-center mt-6">
                <button
                  onClick={() => setLimit(l => l + PAGE_SIZE)}
                  disabled={loading}
                  className="text-sm text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Carregando...' : `+ mostrar mais (${items.length}/${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <CardDetailModal card={selected} allTags={allTags} onClose={() => setSelected(null)} onUpdated={() => { load(); refreshTags() }} />
    </div>
  )
}
