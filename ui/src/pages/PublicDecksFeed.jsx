import { useState, useEffect } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'

const COLOR_DOT = { W: '#f0ede0', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f' }
const PAGE_SIZE = 24
const FORMAT_LABEL = { commander: 'Commander', brawl: 'Brawl', standard: 'Standard', modern: 'Modern', pioneer: 'Pioneer', legacy: 'Legacy' }

function PublicDeckCard({ deck, onClick }) {
  const colors = (deck.color_identity || '').split(',').filter(Boolean)
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
      </div>
      <div className="p-3.5">
        <h3 className="text-arena-parchment font-display font-semibold text-base leading-tight truncate group-hover:text-arena-gold transition-colors">
          {deck.name || deck.slug}
        </h3>
        {deck.commander_name && <p className="text-arena-muted text-xs truncate mt-1">{deck.commander_name}</p>}
        <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-arena-border-soft">
          <span className="text-arena-gold/80 text-[11px] font-medium">por {deck.owner_name || 'alguém'}</span>
          <span className="text-arena-muted text-[11px]">{deck.card_count || 0} cartas</span>
        </div>
      </div>
    </button>
  )
}

export function PublicDecksFeed({ onSelectDeck, onLoginClick }) {
  const [decks, setDecks] = useState([])
  const [total, setTotal] = useState(0)
  const [byFormat, setByFormat] = useState([])
  const [pilots, setPilots] = useState(0)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [format, setFormat] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = { limit }
    if (format) params.format = format
    api.publicDecks(params)
      .then(res => {
        setDecks(res.decks || [])
        setTotal(res.total || 0)
        setByFormat(res.byFormat || [])
        setPilots(res.pilots || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [limit, format])

  useEffect(() => { setLimit(PAGE_SIZE) }, [format])

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
            Qualquer um pode navegar e ver a decklist completa — só quem entra pode criar, importar ou editar.
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-arena-text font-semibold text-sm uppercase tracking-wide">
            {format ? `Decks de ${FORMAT_LABEL[format] || format}` : 'Todos os decks'}
          </h3>
          {format && (
            <button onClick={() => setFormat('')} className="text-xs text-arena-muted hover:text-arena-gold underline">
              limpar filtro
            </button>
          )}
        </div>

        {loading && decks.length === 0 ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando decks...</div>
        ) : decks.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhum deck público ainda.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {decks.map(deck => (
                <PublicDeckCard key={deck.id} deck={deck} onClick={() => onSelectDeck(deck)} />
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
