import { useState, useMemo } from 'react'
import { CardImage } from './CardImage'

// Fisher-Yates
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// C(n, k) — combinação, calculada via log para evitar overflow com decks de 99 cartas
function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity
  let r = 0
  for (let i = 0; i < k; i++) r += Math.log(n - i) - Math.log(i + 1)
  return r
}

// P(pelo menos 1 sucesso) ao puxar `draws` cartas de uma população de `pop`
// com `successes` cartas-alvo — complemento da hipergeométrica P(0 sucessos).
function probAtLeastOne(pop, successes, draws) {
  if (successes <= 0 || pop <= 0) return 0
  if (draws >= pop) return 1
  const pZero = Math.exp(logChoose(pop - successes, draws) - logChoose(pop, draws))
  return Math.max(0, Math.min(1, 1 - pZero))
}

function buildLibrary(deckCards) {
  // Goldfish: biblioteca = main board, sem o commander (que comeca no command zone)
  const lib = []
  for (const c of deckCards) {
    if (c.board !== 'main') continue
    for (let i = 0; i < (c.quantity || 1); i++) lib.push(c)
  }
  return lib
}

export function GoldfishSimulator({ deckCards, onHover }) {
  const library0 = useMemo(() => buildLibrary(deckCards || []), [deckCards])

  const [hand, setHand] = useState([])
  const [remaining, setRemaining] = useState(library0)
  const [turn, setTurn] = useState(0)
  const [onPlay, setOnPlay] = useState(true)

  // ── Probabilidade ──
  const allTags = useMemo(() => {
    const set = new Set()
    for (const c of library0) for (const t of c.tags || []) set.add(t)
    return [...set].sort()
  }, [library0])

  const [probTag, setProbTag] = useState('')
  const [probTurn, setProbTurn] = useState(3)

  function newHand() {
    const shuffled = shuffle(library0)
    setHand(shuffled.slice(0, 7))
    setRemaining(shuffled.slice(7))
    setTurn(0)
  }

  function drawCard() {
    if (remaining.length === 0) return
    setHand(h => [...h, remaining[0]])
    setRemaining(r => r.slice(1))
    setTurn(t => t + 1)
  }

  const totalLib = library0.length
  const successesInLib = probTag ? library0.filter(c => (c.tags || []).includes(probTag)).length : 0
  // cartas vistas até o turno N: mao inicial (7) + 1 draw/turno, exceto turno 1 se "on the play"
  const cardsSeenByTurn = probTurn > 0
    ? 7 + Math.max(0, probTurn - (onPlay ? 1 : 0))
    : 7
  const probability = probTag ? probAtLeastOne(totalLib, successesInLib, Math.min(cardsSeenByTurn, totalLib)) : null

  return (
    <div className="space-y-4">
      {/* Controles da mão */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={newHand} className="btn-ghost !text-xs !py-1.5">
          {hand.length === 0 ? 'Comprar mão inicial' : '🔄 Mulligan (nova mão)'}
        </button>
        <button
          onClick={drawCard}
          disabled={hand.length === 0 || remaining.length === 0}
          className="btn-ghost !text-xs !py-1.5 disabled:opacity-40"
        >
          + Puxar carta
        </button>
        {hand.length > 0 && (
          <span className="text-arena-muted text-xs">
            Turno {turn} · Biblioteca: {remaining.length} cartas
          </span>
        )}
      </div>

      {/* Mão */}
      {hand.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {hand.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className="w-20 flex-shrink-0"
              onMouseEnter={e => onHover?.(c, e)}
              onMouseLeave={() => onHover?.(null)}
            >
              <CardImage card={c} className="w-full rounded-lg shadow-card" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-arena-muted text-xs">
          Clique em "Comprar mão inicial" para testar uma mão de 7 cartas (goldfish).
        </p>
      )}

      {/* Calculadora de probabilidade */}
      <div className="border-t border-arena-border-soft pt-3">
        <p className="eyebrow mb-2">Probabilidade de draw</p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-arena-muted">Chance de ter ao menos 1 carta com a tag</span>
          <select value={probTag} onChange={e => setProbTag(e.target.value)} className="input !py-1 !text-xs w-32">
            <option value="">selecione...</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-arena-muted">até o turno</span>
          <input
            type="number" min="0" max="20" value={probTurn}
            onChange={e => setProbTurn(Number(e.target.value))}
            className="input !py-1 !text-xs w-14"
          />
          <label className="flex items-center gap-1 text-arena-muted cursor-pointer">
            <input type="checkbox" checked={onPlay} onChange={e => setOnPlay(e.target.checked)} />
            jogando primeiro
          </label>
        </div>
        {probTag && (
          <p className="text-sm mt-2">
            <span className="text-arena-gold font-semibold">{(probability * 100).toFixed(1)}%</span>
            <span className="text-arena-muted">
              {' '}— {successesInLib} de {totalLib} cartas na biblioteca têm "{probTag}",
              vendo {Math.min(cardsSeenByTurn, totalLib)} cartas até o turno {probTurn}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
