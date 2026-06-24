import { useState, useRef } from 'react'
import { api } from '../api'

const EXPORTER_URL = 'https://github.com/NthPhantom10/MTGA-collection-exporter'

// Botão "Importar do Arena" — abre um modal que explica como gerar o
// mtga_collection.json (o Arena não exporta a coleção nativamente) e
// recebe o upload. A importação roda em background no servidor (pode ter
// 10k+ cartas), com progresso por polling.
export function ImportArenaCollectionButton({ onImported }) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  function close() {
    if (importing) return // não fecha no meio de uma importação
    setOpen(false)
    setError(null); setResult(null); setProgress(null)
  }

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

    setError(null); setResult(null); setProgress(null)

    let parsed
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setError('Arquivo inválido — esperado o JSON gerado pelo MTGA-collection-exporter.')
      return
    }
    const entries = Array.isArray(parsed) ? parsed : parsed.entries
    if (!Array.isArray(entries)) {
      setError('Formato inesperado — esperado uma lista de cartas com name/count.')
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
    <>
      <button
        onClick={() => setOpen(true)}
        title="Importar quantidades reais da sua coleção do Arena"
        className="flex items-center gap-1.5 text-xs text-arena-muted hover:text-arena-gold border border-arena-border hover:border-arena-gold/50 rounded-lg px-3 py-1.5 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 10l5 5 5-5M12 15V3" />
        </svg>
        Importar do Arena
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={close}>
          <div className="panel shadow-panel w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="font-display text-arena-parchment font-bold text-lg">Importar coleção do Arena</h2>
              <button onClick={close} className="text-arena-muted hover:text-arena-text text-xl leading-none flex-shrink-0">×</button>
            </div>

            <p className="text-arena-text-dim text-sm mb-4">
              O MTG Arena não exporta a coleção nativamente. Você gera um arquivo
              JSON com uma ferramenta gratuita que lê a memória do jogo aberto e
              sobe aqui — as quantidades reais entram na sua coleção.
            </p>

            <ol className="text-sm text-arena-text-dim space-y-2 mb-4 list-decimal list-inside marker:text-arena-gold">
              <li>Abra o MTG Arena, vá na aba <strong className="text-arena-text">Decks</strong> ou <strong className="text-arena-text">Coleção</strong> e role a lista por ~30s (carrega tudo na memória).</li>
              <li>
                Baixe e rode o{' '}
                <a href={EXPORTER_URL} target="_blank" rel="noopener noreferrer" className="text-arena-gold hover:underline">MTGA-collection-exporter ↗</a>:
                <code className="block bg-arena-bg border border-arena-border rounded px-2 py-1 mt-1 text-[11px] text-arena-text font-mono whitespace-pre-wrap">git clone {EXPORTER_URL}{'\n'}pip install pymem requests{'\n'}python mtg.py</code>
              </li>
              <li>Ele pede <strong className="text-arena-text">5 cartas raras/míticas</strong> que você tem (com a quantidade) para calibrar a leitura.</li>
              <li>No fim ele gera o <code className="text-arena-gold text-[12px]">mtga_collection.json</code> — selecione esse arquivo abaixo.</li>
            </ol>

            <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />

            {!importing && !result && (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full bg-arena-gold hover:bg-arena-gold-light text-arena-bg font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Selecionar mtga_collection.json
              </button>
            )}

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2 mt-3">{error}</p>
            )}

            {progress && !progress.done && (
              <div className="mt-3">
                <div className="h-2 bg-arena-bg rounded-full overflow-hidden">
                  <div className="h-full bg-arena-gold transition-all" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-arena-muted text-xs mt-1.5 text-center">Importando {progress.processed} / {progress.total} cartas…</p>
              </div>
            )}

            {result && (
              <div className="mt-3 text-sm">
                <p className="text-arena-text font-medium mb-1">✓ Importação concluída</p>
                <ul className="text-arena-text-dim text-xs space-y-0.5">
                  <li>Cartas processadas: <span className="text-arena-gold">{result.total}</span></li>
                  <li>Quantidades atualizadas: <span className="text-arena-gold">{result.updated}</span></li>
                  {result.newCards > 0 && <li>Cartas novas criadas: <span className="text-arena-gold">{result.newCards}</span></li>}
                  {result.errors > 0 && <li>Erros: <span className="text-red-400">{result.errors}</span></li>}
                </ul>
                {result.newCards > 0 && (
                  <p className="text-arena-muted text-[11px] mt-2">As cartas novas ainda não têm imagem/preço — clique em "Sincronizar" para buscar no Scryfall.</p>
                )}
                <button onClick={close} className="mt-3 w-full bg-arena-card hover:bg-arena-card-hover text-arena-text py-2 rounded-lg text-sm transition-colors">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
