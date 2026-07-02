import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { DecksList } from './pages/DecksList'
import { LoginPage } from './pages/LoginPage'
import { PublicDecksFeed } from './pages/PublicDecksFeed'
import { ErrorBoundary } from './components/ErrorBoundary'
import { api, getToken, setToken, onUnauthorized } from './api'

// Roteamento mínimo — o app inteiro sempre foi estado interno (sem URL),
// mas um deck público precisa de link compartilhável de verdade (/d/123)
// que funcione sem estar logado. Não vale a pena trazer react-router pra
// UMA rota; poucas linhas com history.pushState resolvem.
function parsePublicDeckId(pathname) {
  const m = pathname.match(/^\/d\/(\d+)$/)
  return m ? m[1] : null
}

// Um deploy troca os hashes dos chunks; uma aba já aberta que tenta
// carregar uma página lazy antiga recebe 404 no import() e a tela fica em
// branco. Recarrega uma vez (sessionStorage evita loop se o erro for outro).
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch(err => {
      const key = 'chunk-reload-attempted'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        return new Promise(() => {}) // recarregando; nunca resolve
      }
      throw err
    })
  )
}

// Carregadas sob demanda — tiram recharts/scanner do bundle inicial (abertura mais rápida)
const DeckView       = lazyWithReload(() => import('./pages/DeckView').then(m => ({ default: m.DeckView })))
const CollectionView = lazyWithReload(() => import('./pages/CollectionView').then(m => ({ default: m.CollectionView })))
const MatchesView    = lazyWithReload(() => import('./pages/MatchesView').then(m => ({ default: m.MatchesView })))
const ScannerView    = lazyWithReload(() => import('./pages/ScannerView').then(m => ({ default: m.ScannerView })))
const AdminUsersView = lazyWithReload(() => import('./pages/AdminUsersView').then(m => ({ default: m.AdminUsersView })))
const PublicDeckView  = lazyWithReload(() => import('./pages/PublicDeckView').then(m => ({ default: m.PublicDeckView })))

function PageFallback() {
  return <div className="text-arena-gold text-center animate-pulse py-24">Carregando…</div>
}

const TABS = [
  { key: 'decks',      label: 'Decks',    icon: 'M3 5h18M3 12h18M3 19h18' },
  { key: 'collection', label: 'Coleção',  icon: 'M4 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z' },
  { key: 'matches',    label: 'Partidas', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'scanner',    label: 'Scanner',  icon: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M3 12h18' },
]

const ADMIN_TAB = { key: 'admin', label: 'Admin', icon: 'M12 4.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM4 19.5c0-3.5 3.5-6 8-6s8 2.5 8 6' }

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

function NavTabs({ page, setPage, isAdmin }) {
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS
  return (
    <nav className="flex items-center gap-1 bg-arena-ink/50 border border-arena-border-soft rounded-xl p-1">
      {tabs.map(({ key, label, icon }) => (
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

  const [publicDeckId, setPublicDeckId] = useState(() => parsePublicDeckId(window.location.pathname))
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const onPop = () => setPublicDeckId(parsePublicDeckId(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goToPublicDeck = (id) => {
    window.history.pushState({}, '', `/d/${id}`)
    setPublicDeckId(String(id))
  }
  const leavePublicDeck = () => {
    window.history.pushState({}, '', '/')
    setPublicDeckId(null)
  }

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

  // Trocar de aba enquanto um deck está aberto deve sair do deck — senão a
  // NavTabs pareceria travada nele (setPage sozinho não bastava)
  const goToPage = (key) => {
    setSelectedDeck(null)
    setPage(key)
  }

  // /d/:id funciona com ou sem login — é o link compartilhável, sempre
  // somente-leitura mesmo pro dono (edição continua só pela aba Decks).
  if (publicDeckId) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PublicDeckView
          deckId={publicDeckId}
          onBack={leavePublicDeck}
          loggedIn={!!user}
          onLoginClick={() => { leavePublicDeck(); if (!user) setShowLogin(true) }}
        />
      </Suspense>
    )
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-arena-gold animate-pulse">Carregando…</div>
  }

  if (!user) {
    if (showLogin) return <LoginPage onAuthenticated={setUser} onBack={() => setShowLogin(false)} />
    return <PublicDecksFeed onSelectDeck={(deck) => goToPublicDeck(deck.id)} onLoginClick={() => setShowLogin(true)} />
  }

  return (
    <div className="min-h-screen">
      {/* Topbar — sempre visível, inclusive dentro de um deck (senão não dá
          pra trocar de página ou sair sem voltar pra lista de decks antes) */}
      <header className="sticky top-0 z-30 bg-arena-bg/85 backdrop-blur-md border-b border-arena-border-soft">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">
          <Brand />
          <div className="mx-auto min-w-0">
            <NavTabs page={selectedDeck ? null : page} setPage={goToPage} isAdmin={!!user.is_admin} />
          </div>
          <div className="hidden md:block">
            <GlobalSearch onSearch={handleGlobalSearch} />
          </div>
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </header>

      <main className="animate-fade-in" key={user.id}>
        <Suspense fallback={<PageFallback />}>
          {selectedDeck ? (
            <DeckView deckId={selectedDeck.id} onBack={() => setSelectedDeck(null)} />
          ) : (
            <>
              {page === 'decks' && <DecksList onSelectDeck={setSelectedDeck} />}
              {page === 'collection' && <CollectionView searchQuery={collectionQuery} searchNonce={searchNonce} />}
              {page === 'matches' && <MatchesView />}
              {page === 'scanner' && <ScannerView />}
              {page === 'admin' && user.is_admin && <AdminUsersView currentUserId={user.id} />}
            </>
          )}
        </Suspense>
      </main>
    </div>
  )
}
