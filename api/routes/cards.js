import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = express.Router()

// GET /api/cards/arena-map → { "<arena_id>": "Card Name", ... }
// PÚBLICO (sem auth) — usado pelo mtga-tracker, que ainda não tem login
// (ver Fase 4). É só um dicionário arena_id->nome do catálogo global,
// não expõe dados de usuário.
router.get('/arena-map', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT arena_id, name FROM cards WHERE arena_id IS NOT NULL')
  const map = {}
  for (const r of rows) map[r.arena_id] = r.name
  res.json(map)
}))

router.use(requireAuth)

// GET /api/cards?q=lightning&color=R&tag=instant&limit=30&offset=0
router.get('/', asyncHandler(async (req, res) => {
  const { q, color, tag, tags, type, cmc_min, cmc_max, colorIdentity, owned, sort, limit = 30, offset = 0 } = req.query
  let where = ['1=1']
  const params = []

  if (q) {
    // Remove operadores especiais do BOOLEAN MODE (+ - < > ( ) ~ * " @) para evitar
    // ER_PARSE_ERROR (1064) com termos como aspas desbalanceadas
    const ftq = q.replace(/[+\-<>()~*"@]+/g, ' ').trim()
    if (ftq) {
      // O indice FULLTEXT ft_card cobre (name, oracle_text, type_line, flavor_text) —
      // o MATCH precisa listar exatamente essas colunas, senao o MySQL lanca
      // ER_FT_MATCHING_KEY_NOT_FOUND (1191)
      where.push('MATCH(c.name, c.oracle_text, c.type_line, c.flavor_text) AGAINST(? IN BOOLEAN MODE)')
      params.push(ftq + '*')
    } else {
      where.push('c.name LIKE ?')
      params.push(`%${q}%`)
    }
  }
  if (color) {
    const cols = color.split(',')
    cols.forEach(col => {
      where.push('FIND_IN_SET(?, c.colors)')
      params.push(col.trim())
    })
  }
  if (type) {
    where.push('c.type_line LIKE ?')
    params.push(`%${type}%`)
  }
  if (cmc_min !== undefined && cmc_min !== '') {
    where.push('c.cmc >= ?')
    params.push(Number(cmc_min))
  }
  if (cmc_max !== undefined && cmc_max !== '') {
    where.push('c.cmc <= ?')
    params.push(Number(cmc_max))
  }
  // ── Filtro de color identity (igual ao /api/cards/search) ──
  // Carta é válida se TODA cor de sua color_identity está dentro de colorIdentity
  // (colorless é sempre válido)
  if (colorIdentity) {
    const validColors = colorIdentity.split(',').map(c => c.trim()).filter(Boolean)
    const allColors = ['W', 'U', 'B', 'R', 'G']
    const forbidden = allColors.filter(c => !validColors.includes(c))
    for (const fc of forbidden) {
      where.push('(c.color_identity IS NULL OR c.color_identity = \'\' OR NOT FIND_IN_SET(?, c.color_identity))')
      params.push(fc)
    }
  }

  // tag(s) filter via EXISTS subquery (AND semantics para multiplas tags)
  // - tag=ramp           -> 1 tag
  // - tags=ramp,draw     -> AND entre as tags (carta precisa ter todas)
  // card_tags é por usuário — só considera as marcações do usuário atual.
  const tagList = []
  if (tag) tagList.push(tag)
  if (tags) tagList.push(...tags.split(',').map(t => t.trim()).filter(Boolean))
  for (const t of tagList) {
    where.push('EXISTS (SELECT 1 FROM card_tags ct JOIN tags tg ON tg.id = ct.tag_id WHERE ct.card_id = c.id AND ct.user_id = ? AND tg.name = ?)')
    params.push(req.userId, t)
  }

  // ── Filtro de posse: digital (Arena/MTGO), física ou ambas (do usuário atual) ──
  if (owned === 'digital') {
    where.push('EXISTS (SELECT 1 FROM collection_digital cdx WHERE cdx.card_id = c.id AND cdx.user_id = ?)')
    params.push(req.userId)
  } else if (owned === 'physical') {
    where.push('EXISTS (SELECT 1 FROM collection_physical cpx WHERE cpx.card_id = c.id AND cpx.user_id = ?)')
    params.push(req.userId)
  }

  // Params usados nas juncoes/subqueries do SELECT/FROM (aparecem no SQL
  // ANTES do WHERE, entao precisam vir primeiro no array de params).
  const preParams = [req.userId, req.userId, req.userId, req.userId]

  let sql = `
    SELECT c.id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
           c.type_line, c.oracle_text, c.rarity, c.set_code,
           c.image_uri, c.scryfall_id, c.keywords, c.edhrec_rank,
           c.price_usd, c.price_usd_foil, c.loyalty, c.power, c.toughness,
           GROUP_CONCAT(DISTINCT t2.name ORDER BY t2.name) AS tags,
           GROUP_CONCAT(DISTINCT d.slug ORDER BY d.slug) AS decks,
           (SELECT SUM(quantity) FROM collection_digital  cd2 WHERE cd2.card_id = c.id AND cd2.user_id = ?) AS qty_digital,
           (SELECT SUM(quantity) FROM collection_physical cp2 WHERE cp2.card_id = c.id AND cp2.user_id = ?) AS qty_physical
    FROM cards c
    LEFT JOIN card_tags ct2 ON ct2.card_id = c.id AND ct2.user_id = ?
    LEFT JOIN tags t2 ON t2.id = ct2.tag_id
    LEFT JOIN deck_cards dc ON dc.card_id = c.id
    LEFT JOIN decks d ON d.id = dc.deck_id AND d.user_id = ?
  `
  // ── Ordenacao ──
  // sort=name|cmc|price|edhrec  (prefixo "-" = desc), ex: sort=-price
  const SORT_COLS = { name: 'c.name', cmc: 'c.cmc', price: 'c.price_usd', edhrec: 'c.edhrec_rank' }
  let orderBy = 'c.name ASC'
  if (sort) {
    const desc = sort.startsWith('-')
    const col = SORT_COLS[desc ? sort.slice(1) : sort]
    if (col) {
      // NULLs sempre por ultimo, independente da direcao
      orderBy = `${col} IS NULL, ${col} ${desc ? 'DESC' : 'ASC'}, c.name ASC`
    }
  }

  const whereSql = ` WHERE ${where.join(' AND ')}`
  sql += `${whereSql} GROUP BY c.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  const fullParams = [...preParams, ...params, Number(limit), Number(offset)]

  const [rows] = await pool.query(sql, fullParams)
  const result = rows.map(r => ({
    ...r,
    tags: r.tags ? r.tags.split(',') : [],
    decks: r.decks ? r.decks.split(',') : [],
    // SUM() do MySQL volta como string via mysql2 — Number() evita virar
    // concatenacao de texto nos botoes +/- da coleção fisica na UI
    qty_digital: Number(r.qty_digital) || 0,
    qty_physical: Number(r.qty_physical) || 0,
  }))

  // ?meta=1 -> retorna { items, total } com contagem total (sem LIMIT) p/ paginacao
  if (req.query.meta) {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM cards c${whereSql}`, params)
    return res.json({ items: result, total })
  }

  res.json(result)
}))

// GET /api/cards/search?q=fly&colorIdentity=G,U&mode=name|text
// colorIdentity filtra pelas cores validas para o deck (commander color identity + incolor)
// Catálogo global — não retorna tags/posse, então não precisa de escopo por usuário.
router.get('/search', asyncHandler(async (req, res) => {
  const { q = '', colorIdentity = '', mode = 'name' } = req.query
  if (q.length < 1) return res.json([])

  const params = []
  const where  = []

  // ── Filtro de texto ──
  if (mode === 'text') {
    // Busca no nome E oracle_text E type_line
    where.push(`(c.name LIKE ? OR c.oracle_text LIKE ? OR c.type_line LIKE ?)`)
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  } else {
    // Modo padrão: só nome
    where.push(`c.name LIKE ?`)
    params.push(`%${q}%`)
  }

  // ── Filtro de color identity ──
  // Regra MTG: carta é válida se TODA cor da carta está dentro da identidade do commander
  // Colorless (sem cor) é sempre válido.
  if (colorIdentity) {
    const validColors = colorIdentity.split(',').map(c => c.trim()).filter(Boolean)
    // Exclui cartas que tenham QUALQUER cor fora da identidade do commander
    const allColors = ['W', 'U', 'B', 'R', 'G']
    const forbidden = allColors.filter(c => !validColors.includes(c))
    for (const fc of forbidden) {
      // Carta não pode ter essa cor no color_identity
      // color_identity NULL ou '' = incolor = sempre válido
      where.push(`(c.color_identity IS NULL OR c.color_identity = '' OR NOT FIND_IN_SET(?, c.color_identity))`)
      params.push(fc)
    }
  }

  params.push(20)

  const sql = `
    SELECT c.id, c.name, c.mana_cost, c.colors, c.color_identity,
           c.type_line, c.image_uri, c.rarity, c.oracle_text
    FROM cards c
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE WHEN c.name LIKE ? THEN 0 ELSE 1 END,
      c.name
    LIMIT ?`

  // Injeta o param do ORDER BY antes do LIMIT
  params.splice(params.length - 1, 0, `${q}%`)

  const [rows] = await pool.query(sql, params)
  res.json(rows)
}))

// GET /api/cards/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [req.params.id])
  if (!card) return res.status(404).json({ error: 'Not found' })

  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ? AND ct.user_id = ?`,
    [req.params.id, req.userId]
  )
  const [decks] = await pool.query(
    `SELECT d.id, d.slug, d.name, dc.board
     FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id
     WHERE dc.card_id = ? AND d.user_id = ?`,
    [req.params.id, req.userId]
  )
  res.json({ ...card, tags: tags.map(t => t.name), decks })
}))

// POST /api/cards/:id/tags { name }
router.post('/:id/tags', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase().replace(/^#/, '')
  if (!name) return res.status(400).json({ error: 'Nome da tag obrigatório' })

  await pool.query('INSERT IGNORE INTO tags (name) VALUES (?)', [name])
  const [[tag]] = await pool.query('SELECT id FROM tags WHERE name = ?', [name])
  await pool.query('INSERT IGNORE INTO card_tags (user_id, card_id, tag_id) VALUES (?, ?, ?)', [req.userId, req.params.id, tag.id])

  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ? AND ct.user_id = ?`,
    [req.params.id, req.userId]
  )
  res.json({ tags: tags.map(t => t.name) })
}))

// DELETE /api/cards/:id/tags/:tagName
router.delete('/:id/tags/:tagName', asyncHandler(async (req, res) => {
  const name = req.params.tagName.trim().toLowerCase()
  await pool.query(
    `DELETE ct FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = ? AND ct.user_id = ? AND t.name = ?`,
    [req.params.id, req.userId, name]
  )
  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ? AND ct.user_id = ?`,
    [req.params.id, req.userId]
  )
  res.json({ tags: tags.map(t => t.name) })
}))

// Colunas de cards que podem ser criadas/editadas manualmente via API
const CARD_WRITABLE = [
  'scryfall_id', 'oracle_id', 'arena_id', 'mtgo_id', 'name', 'flavor_name',
  'mana_cost', 'cmc', 'colors', 'color_identity', 'color_indicator', 'produced_mana',
  'type_line', 'oracle_text', 'keywords', 'layout',
  'power', 'toughness', 'loyalty',
  'set_code', 'set_name', 'collector_number', 'rarity', 'released_at', 'lang',
  'image_uri', 'image_uri_large', 'edhrec_rank', 'price_usd', 'price_eur',
]

// Normaliza valores p/ o INSERT/UPDATE (campos JSON viram string)
function cardValue(field, v) {
  if (v === undefined) return undefined
  if (field === 'keywords' && v !== null && typeof v === 'object') return JSON.stringify(v)
  return v
}

// POST /api/cards — cria carta manualmente (só name é obrigatório).
// Catálogo global — qualquer usuário autenticado pode adicionar uma carta
// nova ao catálogo compartilhado (ex: cartas recém-lançadas).
router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name é obrigatório' })

  const cols = CARD_WRITABLE.filter(f => req.body[f] !== undefined)
  if (!cols.includes('name')) cols.unshift('name')
  const values = cols.map(f => cardValue(f, f === 'name' ? name : req.body[f]) ?? null)

  const [result] = await pool.query(
    `INSERT INTO cards (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    values
  )
  const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [result.insertId])
  res.status(201).json(card)
}))

// PATCH /api/cards/:id — edita campos da carta (catálogo global)
router.patch('/:id', asyncHandler(async (req, res) => {
  const cols = CARD_WRITABLE.filter(f => req.body[f] !== undefined)
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })

  const [[exists]] = await pool.query('SELECT id FROM cards WHERE id = ?', [req.params.id])
  if (!exists) return res.status(404).json({ error: 'Carta não encontrada' })

  await pool.query(
    `UPDATE cards SET ${cols.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map(f => cardValue(f, req.body[f]) ?? null), req.params.id]
  )
  const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [req.params.id])
  res.json(card)
}))

// DELETE /api/cards/:id — remove a carta do catálogo global.
// Por padrão bloqueia se estiver em decks/coleção de QUALQUER usuário
// (FK sem cascade); ?force=true limpa as referências antes.
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id
  const [[exists]] = await pool.query('SELECT id FROM cards WHERE id = ?', [id])
  if (!exists) return res.status(404).json({ error: 'Carta não encontrada' })

  const [[refs]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM deck_cards          WHERE card_id = ?) AS decks,
      (SELECT COUNT(*) FROM collection_digital  WHERE card_id = ?) AS digital,
      (SELECT COUNT(*) FROM collection_physical WHERE card_id = ?) AS physical`,
    [id, id, id]
  )
  const total = refs.decks + refs.digital + refs.physical
  const force = req.query.force === 'true' || req.query.force === '1'

  if (total > 0 && !force) {
    return res.status(409).json({
      error: 'Carta referenciada — use ?force=true para remover junto as referências',
      references: refs,
    })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    if (force) {
      await conn.query('DELETE FROM deck_cards          WHERE card_id = ?', [id])
      await conn.query('DELETE FROM collection_digital  WHERE card_id = ?', [id])
      await conn.query('DELETE FROM collection_physical WHERE card_id = ?', [id])
      await conn.query('UPDATE decks SET commander_id = NULL WHERE commander_id = ?', [id])
    }
    // card_tags, card_faces, card_legalities têm ON DELETE CASCADE
    await conn.query('DELETE FROM cards WHERE id = ?', [id])
    await conn.commit()
    res.json({ ok: true, removed: true, clearedReferences: force ? refs : undefined })
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}))

export default router
