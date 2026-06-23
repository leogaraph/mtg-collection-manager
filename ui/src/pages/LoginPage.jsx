import { useState } from 'react'
import { api, setToken } from '../api'

export function LoginPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password, name.trim() || undefined)
      setToken(result.token)
      onAuthenticated(result.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/logo.png" alt="Mana Vault" className="w-16 h-16 rounded-xl shadow-glow object-cover" />
          <div className="text-center">
            <h1 className="font-display text-arena-parchment text-xl font-bold tracking-wide">Mana Vault</h1>
            <p className="text-arena-muted text-[11px] tracking-[0.18em] uppercase">Collection Manager</p>
          </div>
        </div>

        <div className="panel shadow-panel p-6">
          <div className="flex bg-arena-bg rounded-lg p-1 gap-1 border border-arena-border mb-5">
            {[['login', 'Entrar'], ['register', 'Criar conta']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => { setMode(v); setError(null) }}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === v ? 'bg-arena-gold text-arena-bg' : 'text-arena-muted hover:text-arena-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome (opcional)"
                className="input w-full"
                autoComplete="name"
              />
            )}
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
              className="input w-full"
              autoComplete="email"
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Senha (mín. 8 caracteres)"
              required
              minLength={8}
              className="input w-full"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-arena-gold hover:bg-arena-gold-light text-arena-bg font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
