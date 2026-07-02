// ─── Classificação funcional de cartas: fonte única de verdade ────────────
//
// Usado tanto pelo Deck Doctor (deckAnalysis.js, ao vivo por deck) quanto
// pelas tags automáticas (autoTags.js, persistido em card_tags). Antes desse
// módulo existiam DOIS conjuntos de regex divergentes para ramp/draw/tutor
// (um em deckAnalysis, outro em autoTags) e removal/wipe/counter só existiam
// no Deck Doctor — o que fazia o "Ramp baixo" do Deck Doctor discordar do que
// a tag #ramp realmente cobria, e tornava removal/wipe/counter impossíveis
// de filtrar/usar em sugestões. Agora os dois consomem classifyCard() daqui.

// Papéis "de função" — o núcleo que o Deck Doctor usa pra contar
// ramp/draw/removal/wipe/counter/tutor contra o DECK_TEMPLATE.
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

  // CONTRAMÁGICA — nome do papel é 'counterspell', não 'counter': "counter"
  // sozinho é ambíguo em Magic (+1/+1 counters, poison, loyalty, energy,
  // charge...). Ver também a tag 'plus1-counters' abaixo, que é outra coisa.
  if (/counter target/.test(text)) roles.add('counterspell')

  // TUTOR (busca não-ramp para a mão/topo)
  if (!roles.has('ramp') && /search your library for (a |an |up to )/.test(text) && /(into your hand|on top of your library|top of your library)/.test(text)) roles.add('tutor')

  return roles
}

// Nomes de tag persistidos em card_tags para cada papel de classifyCard().
// 'land' fica de fora — é estrutural, não uma tag de sinergia.
export const ROLE_TAG_NAMES = ['ramp', 'draw', 'removal', 'wipe', 'counterspell', 'tutor']

// ─── Arquétipos/temas de Commander — tags adicionais por heurística direta
// em oracle_text/type_line (não fazem parte do raio-X do Deck Doctor, só do
// vocabulário de tags/sinergia). Cada regra é independente e pode marcar
// mais de uma tag na mesma carta.
export const ARCHETYPE_RULES = [
  {
    name: 'sacrifice', color: '#e8590c',
    description: 'Envolve sacrificar permanentes',
    test: (t) => /sacrifices? (a|an|this|another|[0-9])/.test(t),
  },
  {
    name: 'token', color: '#f08c00',
    description: 'Cria tokens',
    test: (t) => /creates? ([a-z]+|[0-9]+|x) .*tokens?/.test(t),
  },
  {
    name: 'lifegain-trigger', color: '#e64980',
    description: 'Gatilho ao ganhar vida',
    test: (t) => /whenever you gain life/.test(t),
  },
  {
    name: 'reanimacao', color: '#5f3dc4',
    description: 'Devolve criaturas do cemitério ao campo',
    test: (t) => /return (a|target|that|one or more) creature cards? from (your|a|target) graveyard.* (battlefield|hand)/.test(t),
  },
  {
    name: 'banida', color: '#495057',
    description: 'Remove via exílio — subtipo de #removal que bypassa indestrutível/recursão',
    test: (t) => /exiles? target/.test(t),
  },
  {
    name: 'plus1-counters', color: '#2b8a3e',
    description: '+1/+1 counters — coloca, move, dobra ou depende deles (não confundir com contramágica, veneno, lealdade etc.)',
    test: (t) => /\+1\/\+1 counters?/.test(t),
  },
  {
    name: 'aristocrats', color: '#862e2e',
    description: 'Ganha valor quando suas criaturas morrem/são sacrificadas',
    test: (t) => /whenever (a|another|one or more) creatures? (you control )?dies?/.test(t) || /whenever you sacrifice/.test(t),
  },
  {
    name: 'blink', color: '#4a90a4',
    description: 'Exila e devolve permanentes (flicker), reusando ETBs',
    test: (t) => /exile[ds]? .*\breturn(s|ed)? (it|that card|them) to the battlefield/.test(t),
  },
  {
    name: 'artifacts-matter', color: '#748ffc',
    description: 'Sinergiza com ter/jogar artefatos',
    test: (t) => /whenever (a|an|another) artifact (you control )?enters/.test(t) || /number of artifacts you control/.test(t),
  },
  {
    name: 'landfall', color: '#40773a',
    description: 'Landfall ou gatilho equivalente por pousar terrenos',
    test: (t) => /landfall/.test(t) || /whenever a land enters the battlefield under your control/.test(t),
  },
  {
    name: 'spellslinger', color: '#7048e8',
    description: 'Recompensa conjurar instantâneos/feitiços',
    test: (t) => /magecraft/.test(t) || /whenever you cast an? (instant or sorcery|instant|sorcery) spell/.test(t),
  },
  {
    name: 'wheel', color: '#9c6644',
    description: 'Descarta e compra mãos novas (wheel effects)',
    test: (t) => /each player draws (seven|7) cards?/.test(t) || /discard (your hand|their hand)/.test(t),
  },
  {
    name: 'extra-combat', color: '#c92a2a',
    description: 'Concede fases de combate adicionais',
    test: (t) => /additional combat phase/.test(t) || /extra combat phase/.test(t),
  },
  {
    name: 'proliferate', color: '#0ca678',
    description: 'Tem proliferate',
    test: (t) => /proliferate/.test(t),
  },
  {
    name: 'enchantress', color: '#ae3ec9',
    description: 'Compra carta quando um encantamento seu entra',
    // duas eras de templating: "...enters the battlefield under your control"
    // (pre-2022) e "...you control enters" (atual, sem "the battlefield")
    test: (t) => /whenever an enchantment (enters the battlefield under your control|you control enters)/.test(t),
  },
  {
    name: 'graveyard', color: '#343a40',
    description: 'Interage com/depende do próprio cemitério (delve, escape, threshold...)',
    test: (t) => /for each card in your graveyard/.test(t) || /\bdelve\b/.test(t) || /\bescape\b/.test(t) || /\bthreshold\b/.test(t) || /\bflashback\b/.test(t),
  },
  {
    name: 'mill', color: '#5c5f66',
    description: 'Manda cartas para o cemitério via mill',
    test: (t) => /mills? (a|one|two|three|[0-9]+|that many|x) cards?/.test(t) || /put the top .*library into .*graveyard/.test(t),
  },
  {
    name: 'auras-equipment', color: '#f59f00', typeTest: true,
    description: 'É aura/equipamento, ou interage com criaturas encantadas/equipadas (voltron)',
    test: (t, type) => /\bequipment\b/.test(type) || /\baura\b/.test(type) || /enchanted creature/.test(t) || /equipped creature/.test(t),
  },
  {
    name: 'group-hug', color: '#66d9e8',
    description: 'Beneficia todos os jogadores, não só você',
    test: (t) => /each player (draws a card|may draw a card|untaps|search their library)/.test(t),
  },
  {
    name: 'stax', color: '#212529',
    description: 'Restringe recursos dos oponentes (taxas, travas)',
    test: (t) => /(opponents|other players|each opponent)[^.]*(can't|can not|don't untap|skip their)/.test(t) || /spells (your opponents cast )?cost \{1\} more/.test(t),
  },
]
