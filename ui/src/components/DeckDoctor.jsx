// Painel de diagnóstico do deck (Deck Doctor).
// Consome deck.analysis vindo de GET /api/decks/:id.

const FN_ORDER = ['lands', 'ramp', 'draw', 'removal', 'wipe']
const FN_ICON = {
  lands:   'M3 21h18M5 21V7l7-4 7 4v14',          // base
  ramp:    'M13 10V3L4 14h7v7l9-11h-7z',           // raio
  draw:    'M4 5a2 2 0 012-2h8l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2z', // carta
  removal: 'M6 18L18 6M6 6l12 12',                 // x
  wipe:    'M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M9 7V4h6v3', // lixeira
}

function statusColor(value, t) {
  if (value < t.min) return { bar: '#e06a55', text: 'text-arena-red', tag: 'baixo' }
  if (value > t.max) return { bar: '#5aa6d8', text: 'text-arena-blue', tag: 'alto' }
  return { bar: '#5fae74', text: 'text-arena-green', tag: 'ok' }
}

function FnBar({ name, value, t }) {
  const scaleMax = Math.max(value, t.max) * 1.25 || 1
  const pct = (x) => `${Math.min(100, (x / scaleMax) * 100)}%`
  const { bar, text, tag } = statusColor(value, t)
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-arena-text-dim">
          <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={FN_ICON[name]} />
          </svg>
          {t.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-arena-text font-semibold tabular-nums">{value}</span>
          <span className={`text-[9px] uppercase tracking-wide ${text}`}>{tag}</span>
        </span>
      </div>
      {/* trilho com zona ideal sombreada + marcador do valor */}
      <div className="relative h-2 rounded-full bg-arena-ink overflow-hidden">
        <div
          className="absolute inset-y-0 bg-arena-gold/15 border-x border-arena-gold/40"
          style={{ left: pct(t.min), right: `calc(100% - ${pct(t.max)})` }}
        />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(value), background: bar, opacity: 0.85 }} />
      </div>
    </div>
  )
}

const PIP_BG = { W: '#f4f0e2', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f' }
const PIP_FG = { W: '#5a5340', U: '#fff', B: '#1c1230', R: '#fff', G: '#fff' }

function ManaSource({ col, sources, pips, flagged }) {
  const target = Math.max(pips, 1)
  const pct = Math.min(100, (sources / Math.max(target, sources, 1)) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="mana-pip flex-shrink-0" style={{ background: PIP_BG[col], color: PIP_FG[col] }}>{col}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[10px] mb-0.5">
          <span className={flagged ? 'text-arena-red font-medium' : 'text-arena-muted'}>
            {sources} fontes
          </span>
          <span className="text-arena-muted/70">{pips} símbolos</span>
        </div>
        <div className="h-1.5 rounded-full bg-arena-ink overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: flagged ? '#e06a55' : PIP_BG[col], opacity: flagged ? 0.9 : 0.7 }} />
        </div>
      </div>
    </div>
  )
}

export function DeckDoctor({ analysis }) {
  if (!analysis) return null
  const { counts, template, sources, pips, colorIdentity, avgCmc, warnings } = analysis
  const flaggedSources = new Set(
    warnings.filter(w => w.key.startsWith('source_')).map(w => w.key.slice(7))
  )
  const fnWarnings = warnings.filter(w => !w.key.startsWith('source_'))

  return (
    <div className="space-y-4">
      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <h3 className="eyebrow flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Deck Doctor
        </h3>
        <span className="text-[10px] text-arena-muted">CMC méd. <span className="text-arena-text font-semibold">{avgCmc}</span></span>
      </div>

      {/* barras de função */}
      <div className="space-y-2.5">
        {FN_ORDER.map(key => (
          <FnBar key={key} name={key} value={counts[key]} t={template[key]} />
        ))}
      </div>

      {/* base de mana */}
      {colorIdentity.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Base de mana</p>
          <div className="space-y-2">
            {colorIdentity.filter(c => PIP_BG[c]).map(col => (
              <ManaSource key={col} col={col} sources={sources[col] || 0} pips={pips[col] || 0} flagged={flaggedSources.has(col)} />
            ))}
          </div>
        </div>
      )}

      {/* alertas */}
      <div>
        <p className="eyebrow mb-2">Diagnóstico</p>
        {warnings.length === 0 ? (
          <div className="flex items-center gap-2 text-arena-green text-xs bg-arena-green/10 border border-arena-green/25 rounded-lg px-2.5 py-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Deck balanceado pelo template padrão.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {[...fnWarnings, ...warnings.filter(w => w.key.startsWith('source_'))].map((w, i) => (
              <li key={i} className={`flex items-start gap-2 text-[11px] leading-snug rounded-lg px-2.5 py-1.5 border ${
                w.level === 'low'
                  ? 'text-arena-red bg-arena-red/10 border-arena-red/25'
                  : 'text-arena-blue bg-arena-blue/10 border-arena-blue/25'
              }`}>
                <span className="mt-px flex-shrink-0">{w.level === 'low' ? '▼' : '▲'}</span>
                <span>{w.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
