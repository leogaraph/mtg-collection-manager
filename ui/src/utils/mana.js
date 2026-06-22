// Parseia "{2}{W}{U}" em array de tokens para renderizar mana pips
export function parseMana(manaCost) {
  if (!manaCost) return []
  const tokens = []
  const regex = /\{([^}]+)\}/g
  let match
  while ((match = regex.exec(manaCost)) !== null) {
    tokens.push(match[1])
  }
  return tokens
}

export function manaClass(token) {
  const t = token.toUpperCase()
  if (['W','U','B','R','G','C'].includes(t)) return `mana-pip mana-${t}`
  if (t === 'X') return 'mana-pip mana-X'
  if (t === 'P') return 'mana-pip mana-P'
  if (t.includes('/')) {
    // hybrid ex: W/U, B/P
    const [a] = t.split('/')
    return `mana-pip mana-${a}`
  }
  return 'mana-pip mana-generic'
}

export function manaLabel(token) {
  if (token.includes('/')) return token.split('/')[0]
  return token
}

export function cmc(manaCost) {
  const tokens = parseMana(manaCost)
  let total = 0
  for (const t of tokens) {
    if (/^\d+$/.test(t)) total += parseInt(t)
    else if (t === 'X') total += 0
    else if (t.includes('/')) total += 1
    else total += 1
  }
  return total
}

export const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' }
export const COLOR_HEX   = { W: '#f0ede0', U: '#4e9bcd', B: '#8b7bb5', R: '#e35d4a', G: '#5a9e6f', C: '#9aacb8' }

export function getTypeGroup(typeLine) {
  if (!typeLine) return 'Other'
  const t = typeLine.toLowerCase()
  if (t.includes('planeswalker')) return 'Planeswalker'
  if (t.includes('creature'))    return 'Creature'
  if (t.includes('instant'))     return 'Instant'
  if (t.includes('sorcery'))     return 'Sorcery'
  if (t.includes('enchantment')) return 'Enchantment'
  if (t.includes('artifact'))    return 'Artifact'
  if (t.includes('battle'))      return 'Battle'
  if (t.includes('land'))        return 'Land'
  return 'Other'
}

export const TYPE_ORDER = ['Creature','Planeswalker','Instant','Sorcery','Enchantment','Artifact','Battle','Land','Other']
export const TYPE_ICONS = {
  Creature: '⚔️', Planeswalker: '⭐', Instant: '⚡', Sorcery: '🌀',
  Enchantment: '✨', Artifact: '⚙️', Battle: '🛡️', Land: '🌲', Other: '❓'
}
