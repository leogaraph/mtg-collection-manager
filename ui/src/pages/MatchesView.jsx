import { useState, useEffect } from 'react'
import { api } from '../api'

const RESULT_LABEL = {
  win: { text: 'Vitória', cls: 'text-green-400 border-green-400/40 bg-green-400/10' },
  loss: { text: 'Derrota', cls: 'text-red-400 border-red-400/40 bg-red-400/10' },
  draw: { text: 'Empate', cls: 'text-arena-muted border-arena-border bg-arena-bg' },
  in_progress: { text: 'Em andamento', cls: 'text-arena-gold border-arena-gold/40 bg-arena-gold/10' },
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return '—'
  const min = Math.round(ms / 60000)
  return `${min} min`
}

function fmtEvent(eventName) {
  if (!eventName) return '—'
  return eventName.replace(/_/g, ' ')
}

// O mtga-tracker às vezes não consegue resolver o nome do comandante a
// partir do Player.log e manda o id interno da Arena como placeholder
// (ex: "#105148") — mostrar isso como se fosse um nome só confunde.
function fmtDeckLabel(m) {
  if (m.deck_name) return m.deck_name
  if (m.commander_name && !/^#\d+$/.test(m.commander_name)) return m.commander_name
  return null
}

export function MatchesView() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [logLines, setLogLines] = useState([])

  const load = () => api.matches().then(m => { setMatches(m); setLoading(false) })

  useEffect(() => { load() }, [])

  const sync = async () => {
    setSyncing(true)
    setLogLines([])

    const initial = await api.syncLog(0)
    let lastId = initial.length ? initial[initial.length - 1].id : 0

    const poll = setInterval(async () => {
      const rows = await api.syncLog(lastId)
      if (rows.length) {
        lastId = rows[rows.length - 1].id
        setLogLines(prev => [...prev, ...rows])
        await load()
        if (rows.some(r => r.message.includes('concluída'))) {
          clearInterval(poll)
          setSyncing(false)
        }
      }
    }, 1000)

    setTimeout(() => { clearInterval(poll); setSyncing(false) }, 120000)
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-arena-gold font-bold text-xl" style={{ fontFamily: "'Cinzel', serif" }}>
            Histórico de Partidas
          </h2>
          <button
            onClick={sync}
            disabled={syncing}
            title="Atualiza a lista a partir do banco. Para importar novas partidas do Player.log, rode `python main.py --history` no mtga-tracker."
            className="text-xs px-3 py-1.5 rounded border border-arena-gold/40 text-arena-gold hover:bg-arena-gold/10 disabled:opacity-50 transition"
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>

        {(syncing || logLines.length > 0) && (
          <div className="bg-black/40 border border-arena-border rounded-lg px-4 py-3 mb-4 font-mono text-xs text-arena-muted max-h-40 overflow-y-auto">
            {logLines.length === 0 ? (
              <p className="animate-pulse">Aguardando eventos do mtga-tracker (rode `python main.py --history` no host)...</p>
            ) : (
              logLines.map(l => (
                <p key={l.id}>
                  <span className="text-arena-gold/60">{new Date(l.created_at).toLocaleTimeString('pt-BR')}</span> {l.message}
                </p>
              ))
            )}
          </div>
        )}

        {loading ? (
          <div className="text-arena-gold text-center animate-pulse py-20">Carregando partidas...</div>
        ) : matches.length === 0 ? (
          <div className="text-arena-muted text-center py-20">Nenhuma partida registrada ainda.</div>
        ) : (
          <div className="bg-arena-card border border-arena-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-arena-muted text-xs uppercase tracking-wider border-b border-arena-border">
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-4 py-2">Formato</th>
                  <th className="text-left px-4 py-2">Deck / Comandante</th>
                  <th className="text-left px-4 py-2">Oponente</th>
                  <th className="text-left px-4 py-2">Duração</th>
                  <th className="text-center px-4 py-2">Turnos</th>
                  <th className="text-center px-4 py-2">1º?</th>
                  <th className="text-left px-4 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(m => {
                  const r = RESULT_LABEL[m.result] || RESULT_LABEL.in_progress
                  return (
                    <tr key={m.id} className="border-b border-arena-border last:border-0 hover:bg-arena-bg/50 transition-colors">
                      <td className="px-4 py-2 text-arena-text">{fmtDate(m.started_at)}</td>
                      <td className="px-4 py-2 text-arena-muted">{fmtEvent(m.event_name)}</td>
                      <td className="px-4 py-2 text-arena-text">
                        {fmtDeckLabel(m) || <span className="text-arena-muted italic" title="O mtga-tracker não conseguiu identificar o deck/comandante dessa partida">não identificado</span>}
                      </td>
                      <td className="px-4 py-2 text-arena-text">{m.opponent_name || '—'}</td>
                      <td className="px-4 py-2 text-arena-muted">{fmtDuration(m.started_at, m.ended_at)}</td>
                      <td className="px-4 py-2 text-center text-arena-muted">{m.total_turns ?? '—'}</td>
                      <td className="px-4 py-2 text-center text-arena-muted">{m.on_play === null || m.on_play === undefined ? '—' : (m.on_play ? '✅' : '—')}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded border ${r.cls}`}>{r.text}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
