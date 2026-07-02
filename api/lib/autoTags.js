// ─── Tags automáticas: papéis funcionais + arquétipos + keywords ──────────
//
// As DEFINIÇÕES de tag (nome/cor/descrição/categoria) são globais — "ramp" é
// "ramp" pra todo mundo. As ASSOCIAÇÕES (card_tags) são por usuário, porque
// "meta" depende dos decks de cada um.
//
// Cada tag também carrega um WEIGHT (0-100, em card_tags) — a força do sinal
// pra fins de cálculo de sinergia em /api/decks/:id/tag-suggestions. Tags
// "goodstuff" (staple/meta) indicam popularidade/uso pessoal, não afinidade
// temática com um deck específico, então carregam peso baixo pra não dominar
// o ranking de sugestões só por serem comuns.
//
// ramp/draw/removal/wipe/counterspell/tutor e os arquétipos (sacrifice,
// token, plus1-counters, aristocrats etc.) são calculados em JS via
// cardRoles.js — a
// MESMA classificação usada pelo Deck Doctor (deckAnalysis.js) — em vez de
// regex SQL duplicada, pra garantir que o raio-X do deck e as tags batem.

import { classifyCard, ROLE_TAG_NAMES, ARCHETYPE_RULES } from './cardRoles.js'

const ROLE_TAG_META = {
  ramp:    { color: '#2f9e44', description: 'Acelera mana — adiciona mana extra, tesouros ou busca terrenos' },
  draw:    { color: '#1c7ed6', description: 'Compra cartas extras' },
  removal: { color: '#c92a2a', description: 'Remoção pontual — destrói ou exila um alvo' },
  wipe:    { color: '#a61e4d', description: 'Board wipe — afeta todos/vários permanentes de uma vez' },
  counterspell: { color: '#1098ad', description: 'Anula mágicas ou habilidades' },
  tutor:   { color: '#9c36b5', description: 'Busca carta específica na biblioteca' },
}

// Tags calculadas via SQL direto (não dependem de classificar oracle_text em JS).
export const AUTO_TAGS = {
  staple: {
    color: '#c89b3c',
    description: 'Staple do Commander — entre as ~1000 cartas mais jogadas no EDHREC',
    category: 'meta',
    weight: 15, // popularidade geral != sinergia com ESTE deck — não deve dominar o ranking de sugestões
    selectSql: 'SELECT id FROM cards WHERE edhrec_rank IS NOT NULL AND edhrec_rank <= 1000',
  },
  meta: {
    color: '#7c5cbf',
    description: 'No seu meta — presente em 3 ou mais dos seus decks ativos',
    category: 'meta',
    weight: 25, // sinal pessoal ("eu gosto de jogar isso"), mas ainda não é sinergia temática
    // depende dos decks do USUARIO -> selectSql vira funcao. userId vem
    // sempre de req.userId (extraido do JWT), nunca de input livre, mas
    // ainda assim forcamos Number() por seguranca (nunca interpolar string).
    selectSql: (userId) => `SELECT dc.card_id AS id
                FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
                WHERE d.user_id = ${Number(userId)} AND d.is_active = 1 AND dc.board IN ('main','commander')
                GROUP BY dc.card_id
                HAVING COUNT(DISTINCT dc.deck_id) >= 3`,
  },
}

// Recalcula uma única tag automática para um usuário (upsert da definição
// global + reassocia as cartas DESSE usuário). `cardIds` (lista de ids já
// calculada em JS) tem prioridade sobre `selectSql` quando ambos vierem.
export async function applyAutoTag(conn, userId, name, { color, description, category = null, weight = 100, selectSql, cardIds }) {
  await conn.query(
    `INSERT INTO tags (name, color, is_auto, category, description) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE color=VALUES(color), is_auto=TRUE, category=VALUES(category), description=VALUES(description)`,
    [name, color, true, category, description]
  )
  const [[tag]] = await conn.query('SELECT id FROM tags WHERE name = ?', [name])
  await conn.query('DELETE FROM card_tags WHERE tag_id = ? AND user_id = ?', [tag.id, userId])

  if (cardIds) {
    if (!cardIds.length) return 0
    const values = cardIds.map(id => [userId, id, tag.id, weight])
    const [{ affectedRows }] = await conn.query(
      `INSERT IGNORE INTO card_tags (user_id, card_id, tag_id, weight) VALUES ?`,
      [values]
    )
    return affectedRows
  }

  const sql = typeof selectSql === 'function' ? selectSql(userId) : selectSql
  const [{ affectedRows }] = await conn.query(
    `INSERT IGNORE INTO card_tags (user_id, card_id, tag_id, weight)
     SELECT ?, id, ?, ? FROM (${sql}) AS src`,
    [userId, tag.id, weight]
  )
  return affectedRows
}

// Roda classifyCard() + ARCHETYPE_RULES sobre TODO o catálogo de cartas de
// uma vez (barato — é regex em memória, não é por-usuário) e agrupa os ids
// de carta por nome de tag. ramp/draw/removal/wipe/counterspell/tutor vêm de
// classifyCard (mesma fonte do Deck Doctor); o resto vem dos arquétipos.
async function computeFunctionalTagCardIds(conn) {
  const [cards] = await conn.query('SELECT id, type_line, oracle_text FROM cards')
  const byTag = {}
  for (const name of ROLE_TAG_NAMES) byTag[name] = []
  for (const rule of ARCHETYPE_RULES) byTag[rule.name] = []

  for (const c of cards) {
    for (const role of classifyCard(c)) {
      if (byTag[role]) byTag[role].push(c.id)
    }
    const text = (c.oracle_text || '').toLowerCase()
    const type = (c.type_line || '').toLowerCase()
    for (const rule of ARCHETYPE_RULES) {
      if (rule.test(text, type)) byTag[rule.name].push(c.id)
    }
  }
  return byTag
}

// Nomes ja' cobertos por papeis/arquetipos (ex: "proliferate", "landfall",
// "mill" sao keyword E arquetipo). A versao arquetipo/papel e' sempre igual
// ou mais abrangente que so checar o literal cards.keywords (normalmente ate
// inclui o proprio texto da keyword), entao ganha — syncKeywordTags pula
// esses nomes pra nao sobrescrever a associacao mais rica com uma mais pobre.
const RESERVED_TAG_NAMES = new Set([...Object.keys(AUTO_TAGS), ...ROLE_TAG_NAMES, ...ARCHETYPE_RULES.map(r => r.name)])

// Gera uma tag automática para cada keyword distinta presente em cards.keywords
// (ex: "Flying" -> tag "flying", "First strike" -> tag "first-strike").
// Keywords sao propriedade global da carta (nao dependem do usuario), mas
// a associacao em card_tags ainda e' gravada por usuario.
export async function syncKeywordTags(conn, userId) {
  const [rows] = await conn.query(`
    SELECT kw.keyword AS kw
    FROM cards,
         JSON_TABLE(cards.keywords, '$[*]' COLUMNS (keyword VARCHAR(64) PATH '$')) AS kw
    WHERE cards.keywords IS NOT NULL AND JSON_LENGTH(cards.keywords) > 0
    GROUP BY kw.keyword
    HAVING COUNT(*) >= 2
  `)
  const result = {}
  for (const { kw } of rows) {
    if (!kw) continue
    const tagName = kw.toLowerCase().replace(/\s+/g, '-')
    if (RESERVED_TAG_NAMES.has(tagName)) continue
    const affectedRows = await applyAutoTag(conn, userId, tagName, {
      color: '#495057',
      description: `Habilidade: ${kw}`,
      category: 'keyword',
      selectSql: `SELECT id FROM cards WHERE JSON_CONTAINS(keywords, JSON_QUOTE('${kw.replace(/'/g, "\\'")}'))`,
    })
    result[tagName] = affectedRows
  }
  return result
}

// Recalcula todas as tags automáticas (staple/meta + papéis funcionais +
// arquétipos + keywords) para UM usuário, numa única transação. Idempotente:
// limpa as associações antigas desse usuário com tags is_auto e recria do
// zero — não toca nas definições de tag (globais) nem nas associações de
// outros usuários. Usado tanto pela rota POST /api/tags/auto quanto ao final
// de uma sincronização Scryfall (api/routes/sync.js).
export async function recomputeAutoTags(pool, userId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      `DELETE ct FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.user_id = ? AND t.is_auto = TRUE`,
      [userId]
    )
    const result = {}
    for (const [name, def] of Object.entries(AUTO_TAGS)) {
      result[name] = await applyAutoTag(conn, userId, name, def)
    }

    const functionalIds = await computeFunctionalTagCardIds(conn)
    for (const name of ROLE_TAG_NAMES) {
      result[name] = await applyAutoTag(conn, userId, name, {
        ...ROLE_TAG_META[name],
        category: 'role',
        cardIds: functionalIds[name],
      })
    }
    for (const rule of ARCHETYPE_RULES) {
      result[rule.name] = await applyAutoTag(conn, userId, rule.name, {
        color: rule.color,
        description: rule.description,
        category: 'archetype',
        cardIds: functionalIds[rule.name],
      })
    }

    Object.assign(result, await syncKeywordTags(conn, userId))
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}
