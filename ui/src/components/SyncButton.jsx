import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

function relativeTime(dateStr) {
  if (!dateStr) return null
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'agora mesmo'
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min} minuto${min === 1 ? '' : 's'}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr} hora${hr === 1 ? '' : 's'}`
  const day = Math.floor(hr / 24)
  if (day < 30) return `há ${day} dia${day === 1 ? '' : 's'}`
  const month = Math.floor(day / 30)
  return `há ${month} mês${month === 1 ? '' : 'es'}`
}

export function SyncButton() {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const loadStatus = () => api.syncStatus().then(setStatus).catch(() => {})

  useEffect(() => {
    loadStatus()
    return () => clearInterval(pollRef.current)
  }, [])

  const pollProgress = () => {
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.syncProgress()
        setProgress(job)
        if (job.done) {
          clearInterval(pollRef.current)
          setSyncing(false)
          setResult({ total: job.total, updated: job.updated, images: job.images, errors: job.errors, errorNames: job.errorNames })
          await loadStatus()
        }
      } catch {
        clearInterval(pollRef.current)
        setSyncing(false)
      }
    }, 1000)
  }

  const handleSync = async (mode) => {
    setSyncing(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      if (mode === 'all') {
        await api.sync('all')
        pollProgress()
      } else {
        const res = await api.sync('new')
        setResult(res)
        setSyncing(false)
        await loadStatus()
      }
    } catch (err) {
      setError(err.message)
      setSyncing(false)
    }
  }

  const pending = status?.unsynced ?? 0
  const lastSync = relativeTime(status?.oldestSync)

  return (
    <div className="relative flex items-center gap-2 flex-wrap">
      {lastSync && !syncing && (
        <span className="hidden sm:inline text-arena-muted text-[11px] whitespace-nowrap" title="Carta sincronizada há mais tempo">
          Sincronizado {lastSync}
        </span>
      )}

      <button
        onClick={() => handleSync('new')}
        disabled={syncing || pending === 0}
        title={pending === 0 ? 'Todas as cartas já estão sincronizadas' : `Baixar imagem/preço/dados de ${pending} carta(s) nova(s)`}
        className="flex items-center gap-1.5 text-xs text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {syncing && !progress ? 'Sincronizando...' : pending > 0 ? `Sincronizar (${pending})` : 'Sincronizado'}
      </button>

      <button
        onClick={() => handleSync('all')}
        disabled={syncing}
        title="Ressincroniza todas as cartas com o Scryfall (preços, imagens, textos) — pode demorar alguns minutos"
        className="flex items-center gap-1.5 text-xs text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {progress && !progress.done
          ? `Sincronizando ${progress.processed}/${progress.total}...`
          : 'Sincronizar tudo'}
      </button>

      {progress && !progress.done && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-arena-panel border border-arena-border rounded-lg p-2 z-50 shadow-lg">
          <div className="h-1.5 bg-arena-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-arena-gold transition-all"
              style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-arena-muted text-[10px] mt-1">{progress.processed} / {progress.total} cartas</p>
        </div>
      )}

      {(result || error) && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-arena-panel border border-arena-border rounded-lg p-3 text-xs z-50 shadow-lg">
          {error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            <>
              <p className="text-arena-text mb-1">Sincronização concluída</p>
              <ul className="text-arena-muted space-y-0.5">
                <li>Total verificado: <span className="text-arena-gold">{result.total}</span></li>
                <li>Atualizadas: <span className="text-arena-gold">{result.updated}</span></li>
                <li>Imagens baixadas: <span className="text-arena-gold">{result.images}</span></li>
                {result.errors > 0 && <li>Erros: <span className="text-red-400">{result.errors}</span></li>}
              </ul>
              {result.errorNames?.length > 0 && (
                <div className="mt-1 max-h-20 overflow-y-auto text-[10px] text-red-400">
                  {result.errorNames.map((n, i) => <div key={i}>{n}</div>)}
                </div>
              )}
              <button onClick={() => setResult(null)} className="mt-2 text-arena-muted hover:text-arena-gold text-[10px]">fechar</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
