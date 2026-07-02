import { useState, useEffect } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'

const COLOR_DOT = { W: '#f0ede0', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f' }
const PAGE_SIZE = 24

function PublicDeckCard({ deck, onClick }) {
  const colors = (deck.color_identity || '').split(',').filter(Boolean)
  return (
    <button
      onClick={onClick}
      className="relative bg-arena-card border border-arena-border rounded-xl hover:border-arena-gold/60 hover:shadow-glow transition-all text-left overflow-hidden group"
    >
      <div className="relative h-36 overflow-hidden bg-arena-ink">
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
        <div className="absolute inset-0 bg-gradient-to-t from-arena-card via-arena-card/30 to-transparent" />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-arena-text font-semibold text-sm leading-tight truncate group-hover:text-arena-gold transition-colors">
            {deck.name || deck.slug}
          </h3>
          <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
            {colors.map(c => <span key={c} className="w-3 h-3 rounded-full ring-1 ring-black/30" style={{ background: COLOR_DOT[c] || '#9aacb8' }} />)}
          </div>
        </div>
        {deck.commander_name && <p className="text-arena-muted text-xs truncate mb-1">{deck.commander_name}</p>}
        <p className="text-arena-text-dim text-[11px]">por {deck.owner_name || 'alguém'}</p>
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-arena-border-soft">
          <span className="text-arena-text-dim text-[10px] capitalize">{deck.format}</span>
          <span className="text-arena-muted text-[11px] font-medium">{deck.card_count || 0} cards</span>
        </div>
      </div>
    </button>
  )
}

export function PublicDecksFeed({ onSelectDeck, onLoginClick }) {
  const [decks, setDecks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => {
    setLoading(true)
    api.publicDecks({ limit })
      .then(res => { setDecks(res.decks || []); setTotal(res.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [limit])

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h2 className="font-display text-arena-parchment text-2xl font-bold leading-none">Últimos decks</h2>
          <p className="text-arena-muted text-sm mt-1.5">
            <span className="text-arena-gold font-semibold">{total}</span> decks cadastrados — só quem entra pode criar ou editar
          </p>
        </div>

        {loading && decks.length === 0 ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando decks...</div>
        ) : decks.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhum deck público ainda.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {decks.map(deck => (
                <PublicDeckCard key={deck.id} deck={deck} onClick={() => onSelectDeck(deck)} />
              ))}
            </div>
            {decks.length < total && (
              <div className="text-center mt-6">
                <button
                  onClick={() => setLimit(l => l + PAGE_SIZE)}
                  disabled={loading}
                  className="text-sm text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
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
