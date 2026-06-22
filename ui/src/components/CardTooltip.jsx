import { CardImage } from './CardImage'
import { ManaPips } from './ManaPips'

export function CardTooltip({ card, visible, x, y }) {
  if (!visible || !card) return null

  // Posiciona o tooltip para não sair da tela
  const left = x + 260 > window.innerWidth ? x - 250 : x + 16
  const top  = Math.min(y - 20, window.innerHeight - 380)

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left, top }}
    >
      <div className="bg-arena-card border border-arena-border rounded-xl shadow-hover overflow-hidden w-56">
        <CardImage card={card} className="w-full" />
        <div className="p-2 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-arena-text font-semibold text-xs truncate">{card.name}</span>
            <ManaPips cost={card.mana_cost} />
          </div>
          <p className="text-arena-muted text-xs leading-tight">{card.type_line}</p>
          {card.oracle_text && (
            <p className="text-arena-text text-xs leading-tight line-clamp-4 opacity-80">
              {card.oracle_text.replace(/\/\//g, '\n')}
            </p>
          )}
          {(card.power || card.toughness) && (
            <p className="text-arena-gold text-xs font-bold text-right">
              {card.power}/{card.toughness}
            </p>
          )}
          {card.loyalty && (
            <p className="text-arena-blue text-xs font-bold text-right">Loyalty: {card.loyalty}</p>
          )}
        </div>
      </div>
    </div>
  )
}
