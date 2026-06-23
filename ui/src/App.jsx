import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { DecksList } from './pages/DecksList'
import { LoginPage } from './pages/LoginPage'
import { api, getToken, setToken, onUnauthorized } from './api'

// Carregadas sob demanda — tiram recharts/scanner do bundle inicial (abertura mais rápida)
const DeckView       = lazy(() => import('./pages/DeckView').then(m => ({ default: m.DeckView })))
const CollectionView = lazy(() => import('./pages/CollectionView').then(m => ({ default: m.CollectionView })))
const MatchesView    = lazy(() => import('./pages/MatchesView').then(m => ({ default: m.MatchesView })))
const ScannerView    = lazy(() => import('./pages/ScannerView').then(m => ({ default: m.ScannerView })))

function PageFallback() {
  return <div className="text-arena-gold text-center animate-pulse py-24">Carregando…</div>
}

const TABS = [
  { key: 'decks',      label: 'Decks',    icon: 'M3 5h18M3 12h18M3 19h18' },
  { key: 'collection', label: 'Coleção',  icon: 'M4 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z' },
  { key: 'matches',    label: 'Partidas', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'scanner',    label: 'Scanner',  icon: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M3 12h18' },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5 select-none flex-shrink-0">
      <img
        src="/logo.png"
        alt="Mana Vault"
        className="w-9 h-9 rounded-lg shadow-glow flex-shrink-0 object-cover"
      />
      <div className="leading-tight hidden sm:block">
        <h1 className="font-display text-arena-parchment text-base font-bold tracking-wide whitespace-nowrap">Mana Vault</h1>
        <p className="text-arena-muted text-[10px] tracking-[0.18em] uppercase whitespace-nowrap">Collection Manager</p>
      </div>
    </div>
  )
}

function NavTabs({ page, setPage }) {
  return (
    <nav className="flex items-center gap-1 bg-arena-ink/50 border border-arena-border-soft rounded-xl p-1">
      {TABS.map(({ key, label, icon }) => (
        <button
          key={key}
          title={label}
          onClick={() => setPage(key)}
          className={`relative flex items-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
            page === key
              ? 'bg-arena-card text-arena-gold shadow-card'
              : 'text-arena-muted hover:text-arena-text hover:bg-arena-card/40'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  )
}

function GlobalSearch({ onSearch }) {
  const ref = useRef(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = (e) => {
    e.preventDefault()
    onSearch(value.trim())
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 bg-arena-ink/60 border border-arena-border rounded-lg px-3 py-2 focus-within:border-arena-gold/70 transition-colors w-full max-w-xs">
      <svg className="w-4 h-4 text-arena-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Buscar cartas..."
        className="bg-transparent text-arena-text placeholder-arena-muted text-sm outline-none flex-1 min-w-0"
      />
      <kbd className="text-arena-muted/70 text-[10px] font-sans border border-arena-border rounded px-1.5 py-0.5 flex-shrink-0">/</kbd>
    </form>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-arena-muted hover:text-arena-text text-sm px-2 py-1.5 rounded-lg hover:bg-arena-card/60 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-arena-gold/20 text-arena-gold flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {(user.name || user.email)[0].toUpperCase()}
        </span>
        <span className="hidden sm:inline truncate max-w-[10rem]">{user.name || user.email}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-arena-panel border border-arena-border rounded-lg shadow-lg z-50 py-1" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-arena-muted text-xs border-b border-arena-border-soft truncate">{user.email}</div>
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-arena-card/60 transition-colors"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('decks')
  const [selectedDeck, setSelectedDeck] = useState(null)
  const [collectionQuery, setCollectionQuery] = useState('')
  const [searchNonce, setSearchNonce] = useState(0)

  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    onUnauthorized(() => {
      setToken(null)
      setUser(null)
    })
  }, [])

  useEffect(() => {
    if (!getToken()) { setAuthChecked(true); return }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true))
  }, [])

  function handleLogout() {
    setToken(null)
    setUser(null)
  }

  const handleGlobalSearch = (q) => {
    setCollectionQuery(q)
    setSearchNonce(n => n + 1)
    setSelectedDeck(null)
    setPage('collection')
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-arena-gold animate-pulse">Carregando…</div>
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />
  }

  if (selectedDeck) {
    return (
      <Suspense fallback={<PageFallback />}>
        <DeckView
          deckId={selectedDeck.id}
          onBack={() => setSelectedDeck(null)}
        />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-30 bg-arena-bg/85 backdrop-blur-md border-b border-arena-border-soft">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">
          <Brand />
          <div className="mx-auto min-w-0">
            <NavTabs page={page} setPage={setPage} />
          </div>
          <div className="hidden md:block">
            <GlobalSearch onSearch={handleGlobalSearch} />
          </div>
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </header>

      <main className="animate-fade-in">
        <Suspense fallback={<PageFallback />}>
          {page === 'decks' && <DecksList onSelectDeck={setSelectedDeck} />}
          {page === 'collection' && <CollectionView searchQuery={collectionQuery} searchNonce={searchNonce} />}
          {page === 'matches' && <MatchesView />}
          {page === 'scanner' && <ScannerView />}
        </Suspense>
      </main>
    </div>
  )
}
