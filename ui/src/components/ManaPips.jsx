import { parseMana, manaClass, manaLabel } from '../utils/mana'

export function ManaPips({ cost, size = 'sm' }) {
  const tokens = parseMana(cost)
  if (!tokens.length) return null
  return (
    <span className="inline-flex gap-0.5 items-center flex-wrap">
      {tokens.map((t, i) => (
        <span key={i} className={manaClass(t)} style={size === 'lg' ? { width: 22, height: 22, fontSize: 11 } : {}}>
          {manaLabel(t)}
        </span>
      ))}
    </span>
  )
}
