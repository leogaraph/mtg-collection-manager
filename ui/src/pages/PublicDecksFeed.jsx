import { useState, useEffect } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'
import { tagStyle, tagChipStyle } from '../utils/tags'

const COLOR_DOT = { W: '#f0ede0', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f' }
const PAGE_SIZE = 24
const FORMAT_LABEL = { commander: 'Commander', brawl: 'Brawl', standard: 'Standard', modern: 'Modern', pioneer: 'Pioneer', legacy: 'Legacy' }

function spicinessColor(pct) {
  if (pct >= 60) return 'text-red-400'
  if (pct >= 30) return 'text-orange-400'
  return 'text-arena-muted'
}

function TagChip({ name, count, active, onToggle }) {
  const { icon } = tagStyle(name)
  const style = active ? {} : tagChipStyle(name)
  return (
    <span
      onClick={onToggle && (e => { e.stopPropagation(); onToggle(name) })}
      className={`chip !text-[9px] !px-1.5 !py-0.5 ${onToggle ? 'cursor-pointer hover:brightness-125' : ''} ${active ? 'seg-btn-active !rounded-full font-semibold' : ''}`}
      style={style}
    >
      {icon && <span className="leading-none">{icon}</span>}
      {name}
      {count != null && <span className="opacity-60">×{count}</span>}
    </span>
  )
}

function PublicDeckCard({ deck, onClick, onToggleTag }) {
  const colors = (deck.color_identity || '').split(',').filter(Boolean)
  const mythic = Number(deck.mythic_count) || 0
  const rare = Number(deck.rare_count) || 0

  return (
    <button
      onClick={onClick}
      className="relative bg-arena-card border border-arena-border rounded-2xl hover:border-arena-gold/70 hover:shadow-glow hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden group"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-arena-ink">
        {deck.commander_image ? (
          <CardImage
            card={{ image_uri: deck.commander_image }}
            className="w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-700"
            style={{ objectPosition: '50% 16%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-arena-panel to-arena-ink">
            <span className="text-5xl opacity-20">⚔️</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-arena-card via-arena-card/20 to-transparent" />
        <span className="absolute top-2.5 left-2.5 backdrop-blur-sm bg-black/50 text-arena-gold text-[10px] font-semibold px-2 py-1 rounded-full border border-arena-gold/30 uppercase tracking-wide">
          {FORMAT_LABEL[deck.format] || deck.format}
        </span>
        {colors.length > 0 && (
          <div className="absolute top-2.5 right-2.5 flex gap-1">
            {colors.map(c => (
              <span key={c} className="w-3.5 h-3.5 rounded-full ring-1 ring-black/40 shadow" style={{ background: COLOR_DOT[c] || '#9aacb8' }} />
            ))}
          </div>
        )}
        {deck.spiciness != null && deck.spiciness >= 30 && (
          <span className={`absolute bottom-2.5 right-2.5 backdrop-blur-sm bg-black/60 text-[10px] font-bold px-2 py-1 rounded-full ${spicinessColor(deck.spiciness)}`}>
            🌶️ {deck.spiciness}%
          </span>
        )}
      </div>
      <div className="p-3.5">
        <h3 className="text-arena-parchment font-display font-semibold text-base leading-tight truncate group-hover:text-arena-gold transition-colors">
          {deck.name || deck.slug}
        </h3>
        {deck.commander_name && <p className="text-arena-muted text-xs truncate mt-1">{deck.commander_name}</p>}

        {deck.top_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {deck.top_tags.map(t => <TagChip key={t} name={t} onToggle={onToggleTag} />)}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2.5 mt-2.5 border-t border-arena-border-soft text-[11px]">
          {mythic > 0 && (
            <span className="text-orange-400 font-medium" title="Míticas">◆ {mythic}</span>
          )}
          {rare > 0 && (
            <span className="text-arena-gold font-medium" title="Raras">★ {rare}</span>
          )}
          <span className="text-arena-muted ml-auto">{deck.card_count || 0} cartas</span>
        </div>
        <p className="text-arena-gold/70 text-[11px] font-medium mt-1.5">por {deck.owner_name || 'alguém'}</p>
      </div>
    </button>
  )
}

export function PublicDecksFeed({ onSelectDeck, onLoginClick }) {
  const [decks, setDecks] = useState([])
  const [total, setTotal] = useState(0)
  const [byFormat, setByFormat] = useState([])
  const [pilots, setPilots] = useState(0)
  const [tagCloud, setTagCloud] = useState([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [format, setFormat] = useState('')
  const [tags, setTags] = useState(new Set())

  useEffect(() => {
    setLoading(true)
    const params = { limit }
    if (format) params.format = format
    if (tags.size) params.tags = [...tags].join(',')
    api.publicDecks(params)
      .then(res => {
        setDecks(res.decks || [])
        setTotal(res.total || 0)
        setByFormat(res.byFormat || [])
        setPilots(res.pilots || 0)
        setTagCloud(res.tagCloud || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [limit, format, tags])

  useEffect(() => { setLimit(PAGE_SIZE) }, [format, tags])

  const toggleTag = (name) => {
    setTags(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const grandTotal = byFormat.reduce((s, f) => s + f.n, 0)

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="sticky top-0 z-30 bg-arena-bg/85 backdrop-blur-md border-b border-arena-border-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <img src="/logo.png" alt="Mana Vault" className="w-9 h-9 rounded-lg shadow-glow object-cover" />
          <div className="leading-tight hidden sm:block">
            <h1 className="font-display text-arena-parchment text-base font-bold tracking-wide">Mana Vault</h1>
            <p className="text-arena-muted text-[10px] tracking-[0.18em] uppercase">Decks públicos</p>
          </div>
          <button onClick={onLoginClick} className="ml-auto btn-gold !text-sm">Entrar</button>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-arena-border-soft">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,155,60,0.25), transparent)' }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-10 text-center">
          <p className="text-arena-gold text-xs font-semibold uppercase tracking-[0.25em] mb-3">A vitrine da comunidade</p>
          <h2 className="font-display text-arena-parchment text-3xl sm:text-4xl font-bold leading-tight mb-3">
            Decks recém-cadastrados
          </h2>
          <p className="text-arena-muted text-sm max-w-xl mx-auto mb-8">
            Explore os decks da comunidade à vontade — entrar só é necessário pra montar o seu.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <div className="panel px-5 py-3 flex flex-col items-center min-w-[7rem]">
              <span className="text-arena-gold font-display text-2xl font-bold">{grandTotal || total}</span>
              <span className="text-arena-muted text-[11px] uppercase tracking-wide mt-0.5">Decks</span>
            </div>
            <div className="panel px-5 py-3 flex flex-col items-center min-w-[7rem]">
              <span className="text-arena-gold font-display text-2xl font-bold">{pilots}</span>
              <span className="text-arena-muted text-[11px] uppercase tracking-wide mt-0.5">Pilotos</span>
            </div>
            {byFormat.map(f => (
              <button
                key={f.format}
                onClick={() => setFormat(fmt => fmt === f.format ? '' : f.format)}
                className={`panel px-5 py-3 flex flex-col items-center min-w-[7rem] transition-all cursor-pointer hover:border-arena-gold/50 ${
                  format === f.format ? 'border-arena-gold ring-1 ring-arena-gold/50' : ''
                }`}
              >
                <span className="text-arena-text font-display text-2xl font-bold">{f.n}</span>
                <span className="text-arena-muted text-[11px] uppercase tracking-wide mt-0.5">{FORMAT_LABEL[f.format] || f.format}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtro por tags — "achar o que gosta" sem precisar entrar */}
      {tagCloud.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="eyebrow mr-1">Filtrar por tema</span>
            {tagCloud.map(t => (
              <TagChip key={t.name} name={t.name} count={t.n} active={tags.has(t.name)} onToggle={() => toggleTag(t.name)} />
            ))}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-arena-text font-semibold text-sm uppercase tracking-wide">
            {format ? `Decks de ${FORMAT_LABEL[format] || format}` : 'Todos os decks'}
            {tags.size > 0 && <span className="text-arena-gold normal-case"> · {[...tags].join(' + ')}</span>}
          </h3>
          {(format || tags.size > 0) && (
            <button onClick={() => { setFormat(''); setTags(new Set()) }} className="text-xs text-arena-muted hover:text-arena-gold underline">
              limpar filtros
            </button>
          )}
        </div>

        {loading && decks.length === 0 ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando decks...</div>
        ) : decks.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhum deck encontrado com esses filtros.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {decks.map(deck => (
                <PublicDeckCard key={deck.id} deck={deck} onClick={() => onSelectDeck(deck)} onToggleTag={toggleTag} />
              ))}
            </div>
            {decks.length < total && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setLimit(l => l + PAGE_SIZE)}
                  disabled={loading}
                  className="text-sm text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-5 py-2.5 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Carregando...' : `+ mostrar mais (${decks.length}/${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
