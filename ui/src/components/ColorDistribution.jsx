import { COLOR_HEX, COLOR_NAMES } from '../utils/mana'

export function ColorDistribution({ colors = {} }) {
  const entries = Object.entries(colors).filter(([, v]) => v > 0)
  if (!entries.length) return null
  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div>
      <h3 className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">
        Colors
      </h3>
      <div className="space-y-1.5">
        {entries.map(([col, count]) => (
          <div key={col} className="flex items-center gap-2">
            <span
              className="mana-pip"
              style={{ background: COLOR_HEX[col], color: col === 'W' ? '#333' : '#fff', width: 16, height: 16, fontSize: 8 }}
            >
              {col}
            </span>
            <div className="flex-1 bg-arena-border rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(count / total) * 100}%`, background: COLOR_HEX[col] }}
              />
            </div>
            <span className="text-arena-muted text-xs w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
