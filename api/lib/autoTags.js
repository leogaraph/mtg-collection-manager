// ─── Tags automáticas: keywords literais + heurísticas em oracle_text ──
//
// As DEFINIÇÕES de tag (nome/cor/descrição) são globais — "ramp" é "ramp"
// pra todo mundo. As ASSOCIAÇÕES (card_tags) são por usuário, porque
// "meta" depende dos decks de cada um. Por isso `selectSql` pode ser uma
// string fixa (regra global, ex: oracle_text) ou uma função (userId) =>
// sql, quando a regra depende dos dados do próprio usuário (só "meta").

// Definição das tags automáticas funcionais/staple/meta.
// Cada uma tem uma query SQL que retorna os card_id que devem recebê-la.
export const AUTO_TAGS = {
  staple: {
    color: '#c89b3c',
    description: 'Staple do Commander — entre as ~1000 cartas mais jogadas no EDHREC',
    selectSql: 'SELECT id FROM cards WHERE edhrec_rank IS NOT NULL AND edhrec_rank <= 1000',
  },
  meta: {
    color: '#7c5cbf',
    description: 'No seu meta — presente em 3 ou mais dos seus decks ativos',
    // depende dos decks do USUARIO -> selectSql vira funcao. userId vem
    // sempre de req.userId (extraido do JWT), nunca de input livre, mas
    // ainda assim forcamos Number() por seguranca (nunca interpolar string).
    selectSql: (userId) => `SELECT dc.card_id AS id
                FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
                WHERE d.user_id = ${Number(userId)} AND d.is_active = 1 AND dc.board IN ('main','commander')
                GROUP BY dc.card_id
                HAVING COUNT(DISTINCT dc.deck_id) >= 3`,
  },

  // ── Tags funcionais por heurística em oracle_text ──────────
  // Keywords literais (Flying, Hexproof, Lifelink...) são tratadas
  // separadamente em syncKeywordTags(), pois vêm direto de cards.keywords.
  ramp: {
    color: '#2f9e44',
    description: 'Acelera mana — adiciona mana extra ou busca terrenos',
    selectSql: `SELECT id FROM cards WHERE
      oracle_text REGEXP 'add [^.]*mana'
      OR oracle_text REGEXP 'search your library for an? .*land'`,
  },
  draw: {
    color: '#1c7ed6',
    description: 'Compra cartas extras',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'draws? (a|[0-9]+|that many|an additional) cards?'`,
  },
  tutor: {
    color: '#9c36b5',
    description: 'Busca carta específica na biblioteca',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'search your library for a card'`,
  },
  sacrifice: {
    color: '#e8590c',
    description: 'Envolve sacrificar permanentes',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'sacrifices? (a|an|this|another|[0-9])'`,
  },
  counterspell: {
    color: '#1098ad',
    description: 'Anula mágicas',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'counter target spell'`,
  },
  token: {
    color: '#f08c00',
    description: 'Cria tokens',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'creates? ([a-z]+|[0-9]+|x) .*tokens?'`,
  },
  'lifegain-trigger': {
    color: '#e64980',
    description: 'Gatilho ao ganhar vida',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'whenever you gain life'`,
  },
  reanimacao: {
    color: '#5f3dc4',
    description: 'Devolve criaturas do cemitério ao campo',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'return (a|target|that|one or more) creature cards? from (your|a|target) graveyard.* (battlefield|hand)'`,
  },
  banida: {
    color: '#495057',
    description: 'Exila permanentes/cartas (efeito de remoção ou utilidade)',
    selectSql: `SELECT id FROM cards WHERE oracle_text REGEXP 'exiles? target'`,
  },
}

// Recalcula uma única tag automática para um usuário (upsert da definição
// global + reassocia as cartas DESSE usuário).
export async function applyAutoTag(conn, userId, name, { color, description, selectSql }) {
  await conn.query(
    `INSERT INTO tags (name, color, is_auto, description) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE color=VALUES(color), is_auto=TRUE, description=VALUES(description)`,
    [name, color, true, description]
  )
  const [[tag]] = await conn.query('SELECT id FROM tags WHERE name = ?', [name])
  await conn.query('DELETE FROM card_tags WHERE tag_id = ? AND user_id = ?', [tag.id, userId])
  const sql = typeof selectSql === 'function' ? selectSql(userId) : selectSql
  const [{ affectedRows }] = await conn.query(
    `INSERT IGNORE INTO card_tags (user_id, card_id, tag_id)
     SELECT ?, id, ? FROM (${sql}) AS src`,
    [userId, tag.id]
  )
  return affectedRows
}

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
    const affectedRows = await applyAutoTag(conn, userId, tagName, {
      color: '#495057',
      description: `Habilidade: ${kw}`,
      selectSql: `SELECT id FROM cards WHERE JSON_CONTAINS(keywords, JSON_QUOTE('${kw.replace(/'/g, "\\'")}'))`,
    })
    result[tagName] = affectedRows
  }
  return result
}

// Recalcula todas as tags automáticas (staple/meta + funcionais + keywords)
// para UM usuário, numa única transação. Idempotente: limpa as
// associações antigas desse usuário com tags is_auto e recria do zero —
// não toca nas definições de tag (globais) nem nas associações de outros
// usuários. Usado tanto pela rota POST /api/tags/auto quanto ao final de
// uma sincronização Scryfall (api/routes/sync.js).
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
