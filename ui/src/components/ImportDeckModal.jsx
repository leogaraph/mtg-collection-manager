import { useState } from 'react'
import { api } from '../api'

const PLACEHOLDER = `Commander
1 Hapatra, Vizier of Poisons

Deck
1 Sol Ring
1 Arcane Signet
1 Lightning Bolt (M11) 146
...

Sideboard
1 Counterspell`

export function ImportDeckModal({ onClose, onImported }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [format, setFormat] = useState('commander')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleImport = async () => {
    if (!name.trim() || !text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.importDeck({ name: name.trim(), format, text })
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDone = () => {
    onImported?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-arena-panel border border-arena-border rounded-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-arena-gold font-semibold">Importar Deck</h2>
          <button onClick={onClose} className="text-arena-muted hover:text-arena-text text-xl leading-none">×</button>
        </div>

        {!result ? (
          <>
            <div className="bg-arena-bg/60 border border-arena-border-soft rounded-lg p-3 mb-3">
              <p className="text-arena-text-dim text-xs mb-2">Como pegar a lista do MTG Arena:</p>
              <ol className="text-xs text-arena-text-dim space-y-1.5 list-decimal list-inside marker:text-arena-gold">
                <li>No Arena, abra <strong className="text-arena-text">Decks</strong> e passe o mouse sobre o deck.</li>
                <li>Clique no botão <strong className="text-arena-text">Exportar</strong> (ícone <span className="text-arena-gold">⬆</span> no canto do deck) — a lista vai pro seu clipboard no formato Arena.</li>
                <li>Cole aqui (<kbd className="bg-arena-card border border-arena-border rounded px-1">Ctrl+V</kbd>) no campo abaixo e dê um nome.</li>
              </ol>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nome do deck"
                  className="flex-1 bg-arena-bg border border-arena-border rounded-lg px-3 py-2 text-arena-text placeholder-arena-muted text-sm outline-none focus:border-arena-gold transition-colors"
                />
                <select
                  value={format}
                  onChange={e => setFormat(e.target.value)}
                  className="bg-arena-bg border border-arena-border rounded-lg px-3 py-2 text-arena-text text-sm outline-none focus:border-arena-gold transition-colors"
                >
                  <option value="commander">Commander</option>
                  <option value="standard">Standard</option>
                  <option value="historic">Historic</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                rows={12}
                className="w-full bg-arena-bg border border-arena-border rounded-lg p-3 text-arena-text placeholder-arena-muted/50 text-xs font-mono outline-none focus:border-arena-gold transition-colors resize-none"
              />

              <p className="text-arena-muted text-[11px]">
                Cole o deck no formato Arena/Moxfield. Use cabeçalhos <span className="text-arena-text">Commander</span>,{' '}
                <span className="text-arena-text">Deck</span> e <span className="text-arena-text">Sideboard</span> para separar as seções.
                Cartas que ainda não estão na coleção serão criadas (sem dados do Scryfall ainda).
              </p>

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            <button
              onClick={handleImport}
              disabled={loading || !name.trim() || !text.trim()}
              className="mt-4 w-full bg-arena-gold hover:bg-arena-gold-light text-arena-bg font-semibold py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Importando...' : 'Importar'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-arena-text text-sm">
              Deck <span className="text-arena-gold font-semibold">{name}</span> importado com sucesso!
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-arena-bg border border-arena-border rounded-lg py-2">
                <p className="text-arena-gold font-semibold text-lg">{result.total}</p>
                <p className="text-arena-muted text-[10px] uppercase tracking-widest">Cartas</p>
              </div>
              <div className="bg-arena-bg border border-arena-border rounded-lg py-2">
                <p className="text-arena-gold font-semibold text-lg">{result.found}</p>
                <p className="text-arena-muted text-[10px] uppercase tracking-widest">Já na coleção</p>
              </div>
              <div className="bg-arena-bg border border-arena-border rounded-lg py-2">
                <p className="text-arena-gold font-semibold text-lg">{result.created}</p>
                <p className="text-arena-muted text-[10px] uppercase tracking-widest">Novas</p>
              </div>
            </div>

            {result.notFound?.length > 0 && (
              <div>
                <p className="text-arena-muted text-[10px] uppercase tracking-widest mb-1">
                  Cartas novas (sem dados do Scryfall ainda — clique em <span className="text-arena-text normal-case">"Sincronizar"</span> na aba Coleção)
                </p>
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
                  {result.notFound.map(n => (
                    <span key={n} className="bg-arena-bg text-arena-muted text-[10px] px-1.5 py-0.5 rounded border border-arena-border">{n}</span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleDone}
              className="mt-2 w-full bg-arena-gold hover:bg-arena-gold-light text-arena-bg font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
