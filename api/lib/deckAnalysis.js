// ─── Helpers de estatística e análise de deck ─────────────────

export function getTypeGroup(typeLine) {
  if (!typeLine) return 'Other'
  const t = typeLine.toLowerCase()
  if (t.includes('commander'))  return 'Commander'
  if (t.includes('planeswalker')) return 'Planeswalker'
  if (t.includes('creature'))   return 'Creature'
  if (t.includes('instant'))    return 'Instant'
  if (t.includes('sorcery'))    return 'Sorcery'
  if (t.includes('enchantment')) return 'Enchantment'
  if (t.includes('artifact'))   return 'Artifact'
  if (t.includes('battle'))     return 'Battle'
  if (t.includes('land'))       return 'Land'
  return 'Other'
}

export function parseCmc(manaCost) {
  if (!manaCost) return 0
  let cmc = 0
  const generic = manaCost.match(/\{(\d+)\}/)
  if (generic) cmc += parseInt(generic[1])
  const colored = manaCost.match(/\{[WUBRGCSP]\}/g)
  if (colored) cmc += colored.length
  const hybrid = manaCost.match(/\{[WUBRG]\/[WUBRG]\}/g)
  if (hybrid) cmc += (hybrid.length)
  return cmc
}

export function buildStats(cards) {
  const curve = {}
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  const types = {}
  let totalPrice = 0

  for (const c of cards) {
    // mana curve (exclui terrenos)
    if (!c.type_line?.toLowerCase().includes('land')) {
      const cmc = parseCmc(c.mana_cost)
      const key = cmc >= 7 ? '7+' : String(cmc)
      curve[key] = (curve[key] || 0) + (c.quantity || 1)
    }
    // cores
    if (c.colors) {
      c.colors.split(',').forEach(col => {
        if (colors[col] !== undefined) colors[col] += (c.quantity || 1)
      })
    }
    // tipos
    const tg = getTypeGroup(c.type_line)
    types[tg] = (types[tg] || 0) + (c.quantity || 1)
    // preco
    if (c.price_usd) totalPrice += parseFloat(c.price_usd) * (c.quantity || 1)
  }

  return { curve, colors, types, totalPrice: totalPrice.toFixed(2) }
}

// ─── DECK DOCTOR: classificação funcional + análise ──────────
// Classifica uma carta em papéis (ramp, draw, removal, wipe, counter, tutor, land)
// por heurística sobre type_line + oracle_text. Não é perfeito, mas dá um raio-X útil.
export function classifyCard(card) {
  const type = (card.type_line || '').toLowerCase()
  const text = (card.oracle_text || '').toLowerCase()
  const roles = new Set()
  const isLand = type.includes('land')
  if (isLand) roles.add('land')

  // RAMP — aceleração de mana (rocks, dorks, land ramp, tesouros)
  if (!isLand) {
    if (
      /add \{[wubrgc]/.test(text) ||
      /add (one|two|three|four|five|six|that much|x) mana/.test(text) ||
      (/search your library for .*(basic land|forest|island|swamp|mountain|plains|land card)/.test(text) && /(onto the battlefield|into play)/.test(text)) ||
      (/create .*(treasure|powerstone|gold) token/.test(text))
    ) roles.add('ramp')
  }

  // CARD DRAW / vantagem de cartas
  if (/draws? (a|one|two|three|four|five|six|seven|\w+|x|that many) cards?/.test(text)) roles.add('draw')

  // REMOÇÃO PONTUAL
  if (
    /(destroy|exile) target/.test(text) ||
    /target (creature|permanent|player|opponent) .*gets? -\d/.test(text) ||
    /return target (creature|permanent|nonland permanent|artifact|enchantment).* to (its|their) owner'?s? hand/.test(text) ||
    /\bfights?\b/.test(text) ||
    /deals? \d+ damage to (target|any target|target creature|target planeswalker)/.test(text)
  ) roles.add('removal')

  // BOARD WIPE
  if (
    /(destroy|exile) (all|each|every)/.test(text) ||
    /all creatures get -\d/.test(text) ||
    /each (player|opponent) ?sacrifices (all|each)?/.test(text)
  ) roles.add('wipe')

  // CONTRAMÁGICA
  if (/counter target/.test(text)) roles.add('counter')

  // TUTOR (busca não-ramp para a mão/topo)
  if (!roles.has('ramp') && /search your library for (a |an |up to )/.test(text) && /(into your hand|on top of your library|top of your library)/.test(text)) roles.add('tutor')

  return roles
}

// Templates recomendados para Commander (faixas usuais; guia, não regra absoluta)
export const DECK_TEMPLATE = {
  lands:   { min: 35, max: 38, label: 'Terrenos' },
  ramp:    { min: 8,  max: 12, label: 'Ramp' },
  draw:    { min: 8,  max: 12, label: 'Card draw' },
  removal: { min: 5,  max: 10, label: 'Remoção pontual' },
  wipe:    { min: 2,  max: 4,  label: 'Board wipes' },
}

export function buildAnalysis(cards, deck) {
  const counts  = { lands: 0, ramp: 0, draw: 0, removal: 0, wipe: 0, counter: 0, tutor: 0 }
  const byCard  = {}   // id -> [roles] (só papéis "de função", sem land)
  const ci      = (deck.color_identity || deck.commander_color_identity || '').split(',').filter(Boolean)
  const COLS    = ['W', 'U', 'B', 'R', 'G']
  const sources = Object.fromEntries(COLS.map(c => [c, 0]))
  const pips    = Object.fromEntries(COLS.map(c => [c, 0]))

  let totalCards = 0, nonland = 0, cmcSum = 0, cmcN = 0

  for (const c of cards) {
    const qty = c.quantity || 1
    totalCards += qty
    const roles = classifyCard(c)
    const isLand = roles.has('land')

    if (isLand) counts.lands += qty
    for (const r of ['ramp', 'draw', 'removal', 'wipe', 'counter', 'tutor']) {
      if (roles.has(r)) counts[r] += qty
    }
    const fnRoles = [...roles].filter(r => r !== 'land')
    if (fnRoles.length) byCard[c.id] = fnRoles

    if (isLand) {
      const prod = (c.produced_mana || c.colors || '')
      for (const col of COLS) if (prod.includes(col)) sources[col] += qty
    } else {
      nonland += qty
      if (c.mana_cost) {
        for (const col of COLS) {
          const m = c.mana_cost.match(new RegExp(`\\{${col}\\}`, 'g'))
          if (m) pips[col] += m.length * qty
        }
      }
      const cmc = c.cmc != null ? Number(c.cmc) : parseCmc(c.mana_cost)
      if (!Number.isNaN(cmc)) { cmcSum += cmc * qty; cmcN += qty }
    }
  }

  // alertas
  const warnings = []
  for (const [key, t] of Object.entries(DECK_TEMPLATE)) {
    const v = counts[key]
    if (v < t.min) warnings.push({ level: 'low',  key, msg: `${t.label} baixo: ${v} (ideal ${t.min}–${t.max})` })
    else if (v > t.max && key !== 'lands') warnings.push({ level: 'high', key, msg: `${t.label} alto: ${v} (ideal ${t.min}–${t.max})` })
  }
  // mana base: cores na identidade com poucas fontes em relação à demanda de pips
  for (const col of ci) {
    if (pips[col] > 0 && sources[col] < Math.max(8, Math.round(pips[col] * 0.4))) {
      warnings.push({ level: 'low', key: `source_${col}`, msg: `Poucas fontes de ${col}: ${sources[col]} para ${pips[col]} símbolos no custo` })
    }
  }

  return {
    counts,
    template: DECK_TEMPLATE,
    sources,
    pips,
    colorIdentity: ci,
    totalCards,
    nonland,
    avgCmc: cmcN ? (cmcSum / cmcN).toFixed(2) : '0',
    warnings,
    byCard,
  }
}
