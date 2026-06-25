import { useState, useEffect } from 'react'
import { api } from '../api'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function AdminUsersView({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => api.adminUsers().then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const toggleAdmin = async (u) => {
    await api.adminSetAdmin(u.id, !u.is_admin)
    load()
  }

  const removeUser = async (u) => {
    if (!confirm(`Remover a conta de ${u.email}? Isso apaga decks, coleção e partidas dele(a).`)) return
    await api.adminDeleteUser(u.id)
    load()
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h2 className="text-arena-gold font-bold text-xl mb-4" style={{ fontFamily: "'Cinzel', serif" }}>
          Usuários cadastrados
        </h2>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        {loading ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando usuários...</div>
        ) : (
          <div className="bg-arena-card border border-arena-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-arena-muted text-xs uppercase tracking-wider border-b border-arena-border">
                  <th className="text-left px-4 py-2">Nome / Email</th>
                  <th className="text-center px-4 py-2">Decks</th>
                  <th className="text-center px-4 py-2">Digital</th>
                  <th className="text-center px-4 py-2">Física</th>
                  <th className="text-center px-4 py-2">Partidas</th>
                  <th className="text-left px-4 py-2">Cadastro</th>
                  <th className="text-center px-4 py-2">Admin</th>
                  <th className="text-right px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-arena-border last:border-0 hover:bg-arena-bg/50 transition-colors">
                    <td className="px-4 py-2 text-arena-text">
                      <div>{u.name || <span className="text-arena-muted">—</span>}</div>
                      <div className="text-arena-muted text-xs">{u.email}</div>
                    </td>
                    <td className="px-4 py-2 text-center text-arena-muted">{u.deck_count}</td>
                    <td className="px-4 py-2 text-center text-arena-muted">{u.digital_count}</td>
                    <td className="px-4 py-2 text-center text-arena-muted">{u.physical_count}</td>
                    <td className="px-4 py-2 text-center text-arena-muted">{u.match_count}</td>
                    <td className="px-4 py-2 text-arena-muted">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => toggleAdmin(u)}
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? 'Não é possível alterar seu próprio status' : ''}
                        className={`text-xs px-2 py-0.5 rounded border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                          u.is_admin
                            ? 'text-arena-gold border-arena-gold/40 bg-arena-gold/10'
                            : 'text-arena-muted border-arena-border hover:bg-arena-card/60'
                        }`}
                      >
                        {u.is_admin ? 'Admin' : 'Usuário'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => removeUser(u)}
                        disabled={u.id === currentUserId}
                        className="text-xs px-2 py-1 rounded border border-red-400/40 text-red-400 hover:bg-red-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
