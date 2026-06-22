import { useState, useRef } from 'react'
import { api } from '../api'

// Botão "Importar do Arena" — recebe o mtga_collection.json gerado pelo
// MTGA-collection-exporter (ver README) e aplica as quantidades reais na
// coleção digital. A importação roda em background no servidor (pode ter
// 10k+ cartas), então o progresso é acompanhado por polling.
export function ImportArenaCollectionButton({ onImported }) {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const pollProgress = () => {
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.importProgress()
        setProgress(job)
        if (job.done) {
          clearInterval(pollRef.current)
          setImporting(false)
          setResult(job)
          onImported?.()
        }
      } catch {
        clearInterval(pollRef.current)
        setImporting(false)
      }
    }, 1000)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo depois
    if (!file) return

    setError(null)
    setResult(null)
    setProgress(null)

    let parsed
    try {
      const text = await file.text()
      parsed = JSON.parse(text)
    } catch {
      setError('Arquivo inválido — esperado o JSON gerado pelo MTGA-collection-exporter')
      return
    }

    const entries = Array.isArray(parsed) ? parsed : parsed.entries
    if (!Array.isArray(entries)) {
      setError('Formato inesperado — esperado uma lista de cartas com name/count')
      return
    }

    setImporting(true)
    try {
      await api.importArenaCollection(entries)
      pollProgress()
    } catch (err) {
      setError(err.message)
      setImporting(false)
    }
  }

  return (
    <div className="relative">
      <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        title="Importar quantidades reais da sua coleção do Arena (ver README: 'Importando sua coleção do MTG Arena')"
        className="flex items-center gap-1.5 text-xs text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg className={`w-3.5 h-3.5 ${importing && !progress ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 10l5 5 5-5M12 15V3" />
        </svg>
        {importing && progress ? `Importando ${progress.processed}/${progress.total}...` : importing ? 'Importando...' : 'Importar do Arena'}
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
              <p className="text-arena-text mb-1">Importação concluída</p>
              <ul className="text-arena-muted space-y-0.5">
                <li>Cartas processadas: <span className="text-arena-gold">{result.total}</span></li>
                <li>Quantidades atualizadas: <span className="text-arena-gold">{result.updated}</span></li>
                {result.newCards > 0 && <li>Cartas novas criadas: <span className="text-arena-gold">{result.newCards}</span></li>}
                {result.errors > 0 && <li>Erros: <span className="text-red-400">{result.errors}</span></li>}
              </ul>
              {result.newCards > 0 && (
                <p className="text-arena-muted/80 text-[10px] mt-1.5">
                  Cartas novas ainda não têm imagem/preço — clique em "Sincronizar" para buscar no Scryfall.
                </p>
              )}
              <button onClick={() => setResult(null)} className="mt-2 text-arena-muted hover:text-arena-gold text-[10px]">fechar</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
