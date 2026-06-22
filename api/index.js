import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' })) // coleções exportadas do Arena podem ter 10k+ entradas

// Wrapper para rotas async: encaminha erros para o middleware de erro
// em vez de derrubar o processo com unhandled rejection
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Diretorio de imagens das cartas (montado como volume compartilhado com a UI)
const IMG_DIR = path.join(process.cwd(), 'public', 'cards')
fs.mkdirSync(IMG_DIR, { recursive: true })

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'mtg',
  password: process.env.DB_PASS     || 'change_me_password',
  database: process.env.DB_NAME     || 'mtg_collection',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
})

// ─── CARDS ───────────────────────────────────────────────────

// GET /api/cards?q=lightning&color=R&tag=instant&limit=30&offset=0
app.get('/api/cards', asyncHandler(async (req, res) => {
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
  const tagList = []
  if (tag) tagList.push(tag)
  if (tags) tagList.push(...tags.split(',').map(t => t.trim()).filter(Boolean))
  for (const t of tagList) {
    where.push('EXISTS (SELECT 1 FROM card_tags ct JOIN tags tg ON tg.id = ct.tag_id WHERE ct.card_id = c.id AND tg.name = ?)')
    params.push(t)
  }

  // ── Filtro de posse: digital (Arena/MTGO), física ou ambas ──
  if (owned === 'digital') {
    where.push('EXISTS (SELECT 1 FROM collection_digital cdx WHERE cdx.card_id = c.id)')
  } else if (owned === 'physical') {
    where.push('EXISTS (SELECT 1 FROM collection_physical cpx WHERE cpx.card_id = c.id)')
  }

  let sql = `
    SELECT c.id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
           c.type_line, c.oracle_text, c.rarity, c.set_code,
           c.image_uri, c.scryfall_id, c.keywords, c.edhrec_rank,
           c.price_usd, c.price_usd_foil, c.loyalty, c.power, c.toughness,
           GROUP_CONCAT(DISTINCT t2.name ORDER BY t2.name) AS tags,
           GROUP_CONCAT(DISTINCT d.slug ORDER BY d.slug) AS decks,
           (SELECT SUM(quantity) FROM collection_digital  cd2 WHERE cd2.card_id = c.id) AS qty_digital,
           (SELECT SUM(quantity) FROM collection_physical cp2 WHERE cp2.card_id = c.id) AS qty_physical
    FROM cards c
    LEFT JOIN card_tags ct2 ON ct2.card_id = c.id
    LEFT JOIN tags t2 ON t2.id = ct2.tag_id
    LEFT JOIN deck_cards dc ON dc.card_id = c.id
    LEFT JOIN decks d ON d.id = dc.deck_id
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
  const fullParams = [...params, Number(limit), Number(offset)]

  const [rows] = await pool.query(sql, fullParams)
  const result = rows.map(r => ({
    ...r,
    tags: r.tags ? r.tags.split(',') : [],
    decks: r.decks ? r.decks.split(',') : [],
    qty_digital: r.qty_digital || 0,
    qty_physical: r.qty_physical || 0,
  }))

  // ?meta=1 -> retorna { items, total } com contagem total (sem LIMIT) p/ paginacao
  if (req.query.meta) {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM cards c${whereSql}`, params)
    return res.json({ items: result, total })
  }

  res.json(result)
}))

// GET /api/cards/arena-map → { "<arena_id>": "Card Name", ... }
app.get('/api/cards/arena-map', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT arena_id, name FROM cards WHERE arena_id IS NOT NULL')
  const map = {}
  for (const r of rows) map[r.arena_id] = r.name
  res.json(map)
}))

// GET /api/cards/search?q=fly&colorIdentity=G,U&mode=name|text
// colorIdentity filtra pelas cores validas para o deck (commander color identity + incolor)
app.get('/api/cards/search', asyncHandler(async (req, res) => {
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
app.get('/api/cards/:id', asyncHandler(async (req, res) => {
  const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [req.params.id])
  if (!card) return res.status(404).json({ error: 'Not found' })

  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ?`,
    [req.params.id]
  )
  const [decks] = await pool.query(
    `SELECT d.id, d.slug, d.name, dc.board
     FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id
     WHERE dc.card_id = ?`,
    [req.params.id]
  )
  res.json({ ...card, tags: tags.map(t => t.name), decks })
}))

// POST /api/cards/:id/tags { name }
app.post('/api/cards/:id/tags', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase().replace(/^#/, '')
  if (!name) return res.status(400).json({ error: 'Nome da tag obrigatório' })

  await pool.query('INSERT IGNORE INTO tags (name) VALUES (?)', [name])
  const [[tag]] = await pool.query('SELECT id FROM tags WHERE name = ?', [name])
  await pool.query('INSERT IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [req.params.id, tag.id])

  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ?`,
    [req.params.id]
  )
  res.json({ tags: tags.map(t => t.name) })
}))

// DELETE /api/cards/:id/tags/:tagName
app.delete('/api/cards/:id/tags/:tagName', asyncHandler(async (req, res) => {
  const name = req.params.tagName.trim().toLowerCase()
  await pool.query(
    `DELETE ct FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = ? AND t.name = ?`,
    [req.params.id, name]
  )
  const [tags] = await pool.query(
    `SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ?`,
    [req.params.id]
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

// POST /api/cards — cria carta manualmente (só name é obrigatório)
app.post('/api/cards', asyncHandler(async (req, res) => {
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

// PATCH /api/cards/:id — edita campos da carta
app.patch('/api/cards/:id', asyncHandler(async (req, res) => {
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

// DELETE /api/cards/:id — remove a carta.
// Por padrão bloqueia se estiver em decks/coleção (FK sem cascade); ?force=true limpa as referências antes.
app.delete('/api/cards/:id', asyncHandler(async (req, res) => {
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

// ─── DECKS ───────────────────────────────────────────────────

// GET /api/decks
app.get('/api/decks', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT d.*,
           COUNT(dc.id) AS card_count,
           c.name AS commander_name, c.image_uri AS commander_image
    FROM decks d
    LEFT JOIN deck_cards dc ON dc.deck_id = d.id
    LEFT JOIN cards c ON c.id = d.commander_id
    WHERE d.is_active = 1
    GROUP BY d.id
    ORDER BY d.name
  `)
  res.json(rows)
}))

// GET /api/decks/:id  — deck completo com cartas agrupadas por tipo
app.get('/api/decks/:id', asyncHandler(async (req, res) => {
  const [[deck]] = await pool.query(`
    SELECT d.*, c.name AS commander_name, c.image_uri AS commander_image,
           c.colors AS commander_colors, c.color_identity AS commander_color_identity
    FROM decks d
    LEFT JOIN cards c ON c.id = d.commander_id
    WHERE d.id = ?`, [req.params.id])

  if (!deck) {
    // tenta por slug
    const [[bySlug]] = await pool.query(
      `SELECT d.*, c.name AS commander_name, c.image_uri AS commander_image,
              c.colors AS commander_colors, c.color_identity AS commander_color_identity
       FROM decks d
       LEFT JOIN cards c ON c.id = d.commander_id
       WHERE d.slug = ?`, [req.params.id])
    if (!bySlug) return res.status(404).json({ error: 'Not found' })
    return res.redirect(`/api/decks/${bySlug.id}`)
  }

  const [cards] = await pool.query(`
    SELECT c.id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity, c.produced_mana,
           c.type_line, c.oracle_text, c.rarity, c.set_code,
           c.image_uri, c.keywords, c.power, c.toughness, c.loyalty,
           c.price_usd, c.edhrec_rank,
           dc.quantity, dc.board,
           GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags
    FROM deck_cards dc
    JOIN cards c ON c.id = dc.card_id
    LEFT JOIN card_tags ct ON ct.card_id = c.id
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE dc.deck_id = ?
    GROUP BY dc.id
    ORDER BY c.type_line, c.name`, [deck.id])
  for (const c of cards) c.tags = c.tags ? c.tags.split(',') : []

  // agrupa por board e tipo
  const grouped = {}
  for (const card of cards) {
    const board = card.board || 'main'
    if (!grouped[board]) grouped[board] = {}
    const typeGroup = getTypeGroup(card.type_line)
    if (!grouped[board][typeGroup]) grouped[board][typeGroup] = []
    grouped[board][typeGroup].push(card)
  }

  // stats
  const mainCards = cards.filter(c => c.board === 'main')
  const stats = buildStats(mainCards)
  const analysis = buildAnalysis(mainCards, deck)

  res.json({ ...deck, cards, grouped, stats, analysis })
}))

// POST /api/decks
app.post('/api/decks', asyncHandler(async (req, res) => {
  const { slug, name, format = 'commander', platform = 'arena' } = req.body
  const [result] = await pool.query(
    'INSERT INTO decks (slug, name, format, platform) VALUES (?,?,?,?)',
    [slug, name, format, platform]
  )
  res.json({ id: result.insertId, slug, name, format, platform })
}))

// PATCH /api/decks/:id  body: { name?, slug?, format?, platform?, description? }
app.patch('/api/decks/:id', asyncHandler(async (req, res) => {
  const fields = ['name', 'slug', 'format', 'platform', 'description']
  const updates = fields.filter(f => req.body[f] !== undefined)
  if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })

  await pool.query(
    `UPDATE decks SET ${updates.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(f => req.body[f]), req.params.id]
  )
  const [[deck]] = await pool.query('SELECT * FROM decks WHERE id = ?', [req.params.id])
  res.json(deck)
}))

// POST /api/decks/:id/duplicate
app.post('/api/decks/:id/duplicate', asyncHandler(async (req, res) => {
  const [[deck]] = await pool.query('SELECT * FROM decks WHERE id = ?', [req.params.id])
  if (!deck) return res.status(404).json({ error: 'Not found' })

  const baseSlug = `${deck.slug}-copia`
  let slug = baseSlug
  let n = 1
  while (true) {
    const [[exists]] = await pool.query('SELECT id FROM decks WHERE slug = ?', [slug])
    if (!exists) break
    n += 1
    slug = `${baseSlug}-${n}`
  }

  const [result] = await pool.query(
    'INSERT INTO decks (slug, name, format, commander_id, color_identity, platform, description) VALUES (?,?,?,?,?,?,?)',
    [slug, `${deck.name} (cópia)`, deck.format, deck.commander_id, deck.color_identity, deck.platform, deck.description]
  )
  const newDeckId = result.insertId

  await pool.query(
    `INSERT INTO deck_cards (deck_id, card_id, quantity, board)
     SELECT ?, card_id, quantity, board FROM deck_cards WHERE deck_id = ?`,
    [newDeckId, deck.id]
  )

  const [[newDeck]] = await pool.query('SELECT * FROM decks WHERE id = ?', [newDeckId])
  res.json(newDeck)
}))

// DELETE /api/decks/:id  (soft delete)
app.delete('/api/decks/:id', asyncHandler(async (req, res) => {
  await pool.query('UPDATE decks SET is_active = 0 WHERE id = ?', [req.params.id])
  res.json({ ok: true })
}))

// POST /api/decks/import
// Importa um deck colado no formato Arena/Moxfield:
//   Deck / Commander / Sideboard como cabecalhos de secao
//   "1 Sol Ring (CMM) 234"  ou simplesmente "1 Sol Ring"
// Cartas que nao existem no banco sao criadas (so com o nome) para
// serem sincronizadas depois com `sync_scryfall.py --new`.
app.post('/api/decks/import', asyncHandler(async (req, res) => {
  const { name, slug: slugIn, format = 'commander', platform = 'arena', text = '' } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do deck e obrigatorio' })
  if (!text || !text.trim()) return res.status(400).json({ error: 'Cole a lista de cartas' })

  // gera slug a partir do nome, garantindo unicidade
  const baseSlug = (slugIn || name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'deck'

  let slug = baseSlug
  for (let i = 2; ; i++) {
    const [rows] = await pool.query('SELECT id FROM decks WHERE slug = ?', [slug])
    if (!rows.length) break
    slug = `${baseSlug}-${i}`
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [deckResult] = await conn.query(
      'INSERT INTO decks (slug, name, format, platform) VALUES (?,?,?,?)',
      [slug, name.trim(), format, platform]
    )
    const deckId = deckResult.insertId

    const SECTION_BOARD = {
      deck: 'main', main: 'main', mainboard: 'main', maindeck: 'main',
      commander: 'commander', commanders: 'commander',
      sideboard: 'side', side: 'side',
      maybeboard: 'maybe', maybe: 'maybe', considering: 'maybe',
    }

    let board = 'main'
    let commanderCardId = null
    const stats = { total: 0, found: 0, created: 0, notFound: [] }

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue

      const sectionBoard = SECTION_BOARD[line.toLowerCase().replace(/:$/, '')]
      if (sectionBoard) { board = sectionBoard; continue }

      // "1 Card Name (SET) 123" ou "1 Card Name"
      const m = line.match(/^(\d+)x?\s+(.+?)(?:\s+\([A-Za-z0-9]{2,5}\)(?:\s+\S+)?)?$/)
      if (!m) continue
      const quantity = parseInt(m[1], 10)
      const cardName = m[2].trim()
      stats.total++

      const [rows] = await conn.query('SELECT id FROM cards WHERE name = ? LIMIT 1', [cardName])
      let cardId
      if (rows.length) {
        cardId = rows[0].id
        stats.found++
      } else {
        const [insertResult] = await conn.query('INSERT INTO cards (name) VALUES (?)', [cardName])
        cardId = insertResult.insertId
        stats.created++
        stats.notFound.push(cardName)
      }

      await conn.query(
        `INSERT INTO deck_cards (deck_id, card_id, quantity, board)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [deckId, cardId, quantity, board]
      )

      if (board === 'commander' && !commanderCardId) commanderCardId = cardId
    }

    if (commanderCardId) {
      await conn.query('UPDATE decks SET commander_id = ? WHERE id = ?', [commanderCardId, deckId])
    }

    await conn.commit()
    res.json({ deck_id: deckId, slug, ...stats })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}))

// POST /api/decks/:id/cards
app.post('/api/decks/:id/cards', asyncHandler(async (req, res) => {
  const { card_id, quantity = 1, board = 'main' } = req.body
  await pool.query(
    `INSERT INTO deck_cards (deck_id, card_id, quantity, board)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
    [req.params.id, card_id, quantity, board]
  )
  res.json({ ok: true })
}))

// PATCH /api/decks/:id/cards/:cardId
app.patch('/api/decks/:id/cards/:cardId', asyncHandler(async (req, res) => {
  const { quantity, board } = req.body
  if (quantity === 0) {
    await pool.query(
      'DELETE FROM deck_cards WHERE deck_id=? AND card_id=?',
      [req.params.id, req.params.cardId]
    )
  } else {
    await pool.query(
      `UPDATE deck_cards SET quantity=COALESCE(?,quantity), board=COALESCE(?,board)
       WHERE deck_id=? AND card_id=?`,
      [quantity, board, req.params.id, req.params.cardId]
    )
  }
  res.json({ ok: true })
}))

// DELETE /api/decks/:id/cards/:cardId
app.delete('/api/decks/:id/cards/:cardId', asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM deck_cards WHERE deck_id=? AND card_id=?',
    [req.params.id, req.params.cardId]
  )
  res.json({ ok: true })
}))

// GET /api/decks/:id/export  — formato Arena
app.get('/api/decks/:id/export', asyncHandler(async (req, res) => {
  const [cards] = await pool.query(`
    SELECT c.name, c.set_code, c.arena_id, dc.quantity, dc.board
    FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = ?`, [req.params.id])

  const main = cards.filter(c => c.board === 'main')
    .map(c => `${c.quantity} ${c.name}${c.set_code ? ` (${c.set_code.toUpperCase()})` : ''}`)
    .join('\n')
  const side = cards.filter(c => c.board === 'side')
  const sideStr = side.length ? '\n\nSideboard\n' + side.map(c => `${c.quantity} ${c.name}`).join('\n') : ''

  res.setHeader('Content-Type', 'text/plain')
  res.send(main + sideStr)
}))

// ─── SUGGESTIONS (EDHREC) ────────────────────────────────────

// In-memory cache: slug → { data, ts }
const edhrecCache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24h

function toEdhrecSlug(name) {
  // "Hapatra, Vizier of Poisons" → "hapatra-vizier-of-poisons"
  // DFCs: use first face only
  const first = name.split('//')[0].trim()
  return first
    .toLowerCase()
    .replace(/[',.'`]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseEdhrecSuggestions(data, deckCardNames) {
  const cardlists = data?.container?.json_dict?.cardlists || []
  const suggestions = []
  for (const section of cardlists) {
    for (const card of section.cardviews || []) {
      if (!card.name) continue
      if (deckCardNames.has(card.name.toLowerCase())) continue
      suggestions.push({
        name:            card.name,
        synergy:         card.synergy        ?? 0,
        inclusion:       card.inclusion      ?? 0,
        num_decks:       card.num_decks      ?? 0,
        potential_decks: card.potential_decks ?? 0,
        salt:            card.salt           ?? 0,
        category:        section.tag || section.header || '',
      })
    }
  }
  suggestions.sort((a, b) => b.synergy - a.synergy)
  return suggestions
}

// GET /api/decks/:id/suggestions?limit=30
app.get('/api/decks/:id/suggestions', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100)

  // deck + commander
  const [[deck]] = await pool.query(
    `SELECT d.id, d.name, d.commander_id,
            c.name AS commander_name,
            c.color_identity AS commander_color_identity
     FROM decks d LEFT JOIN cards c ON c.id = d.commander_id
     WHERE d.id = ?`,
    [req.params.id]
  )
  if (!deck) return res.status(404).json({ error: 'Not found' })
  if (!deck.commander_name) {
    return res.json({ suggestions: [], source: 'none', reason: 'No commander set for this deck' })
  }

  // names already in deck (to exclude from suggestions)
  const [deckCards] = await pool.query(
    `SELECT c.name FROM deck_cards dc JOIN cards c ON c.id = dc.card_id WHERE dc.deck_id = ?`,
    [deck.id]
  )
  const deckCardNames = new Set(deckCards.map(c => c.name.toLowerCase()))

  const slug = toEdhrecSlug(deck.commander_name)

  // check cache
  let edhrecData
  const hit = edhrecCache.get(slug)
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    edhrecData = hit.data
  } else {
    try {
      const url = `https://json.edhrec.com/pages/commanders/${slug}.json`
      const resp = await fetch(url, { headers: { 'User-Agent': 'MTGCollectionManager/1.0' } })
      if (!resp.ok) {
        return res.json({ suggestions: [], source: 'edhrec', slug, reason: `EDHREC returned HTTP ${resp.status}` })
      }
      edhrecData = await resp.json()
      edhrecCache.set(slug, { data: edhrecData, ts: Date.now() })
    } catch (err) {
      console.error('EDHREC error:', err.message)
      return res.status(502).json({ error: 'EDHREC unreachable', detail: err.message })
    }
  }

  const all = parseEdhrecSuggestions(edhrecData, deckCardNames)

  // cross-reference with user's collection (cards table)
  const topSlice = all.slice(0, limit * 3)  // fetch more, filter down
  if (topSlice.length > 0) {
    const placeholders = topSlice.map(() => '?').join(',')
    const names = topSlice.map(s => s.name)
    const [owned] = await pool.query(
      `SELECT c.name, c.image_uri, c.mana_cost, c.type_line, c.color_identity,
              c.rarity, c.oracle_text, c.power, c.toughness, c.loyalty,
              GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags
       FROM cards c
       LEFT JOIN card_tags ct ON ct.card_id = c.id
       LEFT JOIN tags t ON t.id = ct.tag_id
       WHERE c.name IN (${placeholders})
       GROUP BY c.id`,
      names
    )
    const ownedMap = new Map(owned.map(c => [c.name.toLowerCase(), c]))
    for (const s of topSlice) {
      const col = ownedMap.get(s.name.toLowerCase())
      if (col) {
        s.inCollection = true
        s.image_uri    = col.image_uri
        s.mana_cost    = col.mana_cost
        s.type_line    = col.type_line
        s.rarity       = col.rarity
        s.oracle_text  = col.oracle_text
        s.power        = col.power
        s.toughness    = col.toughness
        s.loyalty      = col.loyalty
        s.tags         = col.tags ? col.tags.split(',') : []
      } else {
        s.inCollection = false
        s.tags = []
      }
    }
  }

  const results = topSlice.slice(0, limit)
  res.json({ suggestions: results, total: all.length, source: 'edhrec', slug })
}))

// ─── TAGS ────────────────────────────────────────────────────

app.get('/api/tags', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, COUNT(ct.card_id) AS card_count
     FROM tags t LEFT JOIN card_tags ct ON ct.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.is_auto DESC, card_count DESC`
  )
  res.json(rows)
}))

// Definição das tags automáticas (recalculadas por POST /api/tags/auto).
// Cada uma tem uma query SQL que retorna os card_id que devem recebê-la.
const AUTO_TAGS = {
  staple: {
    color: '#c89b3c',
    description: 'Staple do Commander — entre as ~1000 cartas mais jogadas no EDHREC',
    selectSql: 'SELECT id FROM cards WHERE edhrec_rank IS NOT NULL AND edhrec_rank <= 1000',
  },
  meta: {
    color: '#7c5cbf',
    description: 'No seu meta — presente em 3 ou mais dos seus decks ativos',
    selectSql: `SELECT dc.card_id AS id
                FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
                WHERE d.is_active = 1 AND dc.board IN ('main','commander')
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

// Recalcula uma única tag automática (upsert + reassocia cartas).
async function applyAutoTag(conn, name, { color, description, selectSql }) {
  await conn.query(
    `INSERT INTO tags (name, color, is_auto, description) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE color=VALUES(color), is_auto=TRUE, description=VALUES(description)`,
    [name, color, true, description]
  )
  const [[tag]] = await conn.query('SELECT id FROM tags WHERE name = ?', [name])
  await conn.query('DELETE FROM card_tags WHERE tag_id = ?', [tag.id])
  const [{ affectedRows }] = await conn.query(
    `INSERT IGNORE INTO card_tags (card_id, tag_id)
     SELECT id, ? FROM (${selectSql}) AS src`,
    [tag.id]
  )
  return affectedRows
}

// Gera uma tag automática para cada keyword distinta presente em cards.keywords
// (ex: "Flying" -> tag "flying", "First strike" -> tag "first-strike").
async function syncKeywordTags(conn) {
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
    const affectedRows = await applyAutoTag(conn, tagName, {
      color: '#495057',
      description: `Habilidade: ${kw}`,
      selectSql: `SELECT id FROM cards WHERE JSON_CONTAINS(keywords, JSON_QUOTE('${kw.replace(/'/g, "\\'")}'))`,
    })
    result[tagName] = affectedRows
  }
  return result
}

// POST /api/tags/auto — recalcula todas as tags automáticas:
// staple/meta + tags funcionais por oracle_text + uma tag por keyword literal.
// Idempotente: recria cada tag, limpa as associações antigas e reinsere conforme os dados atuais.
app.post('/api/tags/auto', asyncHandler(async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Limpa tags automaticas antigas (ex: keywords que ficaram orfas apos
    // mudar o limiar de ocorrencia) antes de recriar do zero.
    await conn.query('DELETE FROM tags WHERE is_auto = TRUE')
    const result = {}
    for (const [name, def] of Object.entries(AUTO_TAGS)) {
      result[name] = await applyAutoTag(conn, name, def)
    }
    Object.assign(result, await syncKeywordTags(conn))
    await conn.commit()
    res.json({ ok: true, tagged: result })
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}))

// POST /api/tags — cria tag avulsa { name, color?, description? }
app.post('/api/tags', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase().replace(/^#/, '')
  if (!name) return res.status(400).json({ error: 'name é obrigatório' })
  const { color = null, description = null } = req.body

  const [[existing]] = await pool.query('SELECT id FROM tags WHERE name = ?', [name])
  if (existing) return res.status(409).json({ error: 'Tag já existe', id: existing.id })

  const [result] = await pool.query(
    'INSERT INTO tags (name, color, description) VALUES (?,?,?)',
    [name, color, description]
  )
  const [[tag]] = await pool.query('SELECT * FROM tags WHERE id = ?', [result.insertId])
  res.status(201).json(tag)
}))

// PATCH /api/tags/:id — renomeia / recoloriza / descreve { name?, color?, description? }
app.patch('/api/tags/:id', asyncHandler(async (req, res) => {
  const [[tag]] = await pool.query('SELECT * FROM tags WHERE id = ?', [req.params.id])
  if (!tag) return res.status(404).json({ error: 'Tag não encontrada' })

  const updates = {}
  if (req.body.name !== undefined) {
    const newName = String(req.body.name).trim().toLowerCase().replace(/^#/, '')
    if (!newName) return res.status(400).json({ error: 'name inválido' })
    const [[clash]] = await pool.query('SELECT id FROM tags WHERE name = ? AND id <> ?', [newName, req.params.id])
    if (clash) return res.status(409).json({ error: 'Já existe outra tag com esse nome' })
    updates.name = newName
  }
  if (req.body.color !== undefined)       updates.color = req.body.color
  if (req.body.description !== undefined) updates.description = req.body.description

  const cols = Object.keys(updates)
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })

  await pool.query(
    `UPDATE tags SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map(c => updates[c]), req.params.id]
  )
  const [[updated]] = await pool.query('SELECT * FROM tags WHERE id = ?', [req.params.id])
  res.json(updated)
}))

// DELETE /api/tags/:id — remove a tag (card_tags cai por cascade).
// Obs: tags automáticas (staple/meta) podem voltar ao rodar POST /api/tags/auto.
app.delete('/api/tags/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM tags WHERE id = ?', [req.params.id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Tag não encontrada' })
  res.json({ ok: true, removed: true })
}))

// ─── COLLECTION ──────────────────────────────────────────────

app.get('/api/collection', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, q, source = 'digital' } = req.query
  const table = source === 'physical' ? 'collection_physical' : 'collection_digital'
  let where = '1=1'
  const params = []
  if (q) { where += ' AND c.name LIKE ?'; params.push(`%${q}%`) }
  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.mana_cost, c.colors, c.type_line, c.image_uri,
           c.rarity, c.price_usd, col.quantity${source === 'physical' ? ', col.condition, col.finish' : ', col.platform'}
    FROM ${table} col
    JOIN cards c ON c.id = col.card_id
    WHERE ${where}
    ORDER BY c.name LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  )
  res.json(rows)
}))

// POST /api/collection/physical  body: { card_id, quantity, condition, finish, lang, notes, acquired_price, acquired_at }
// Upsert: cria ou atualiza a entrada da coleção física para uma carta.
// quantity <= 0 remove a entrada.
app.post('/api/collection/physical', asyncHandler(async (req, res) => {
  const { card_id, quantity = 1, condition = 'NM', finish = 'nonfoil', lang = 'en', notes, acquired_price, acquired_at } = req.body
  if (!card_id) return res.status(400).json({ error: 'card_id é obrigatório' })

  if (Number(quantity) <= 0) {
    await pool.query('DELETE FROM collection_physical WHERE card_id = ?', [card_id])
    return res.json({ ok: true, removed: true })
  }

  await pool.query(
    `INSERT INTO collection_physical (card_id, quantity, \`condition\`, finish, lang, notes, acquired_price, acquired_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), \`condition\`=VALUES(\`condition\`),
       finish=VALUES(finish), lang=VALUES(lang), notes=VALUES(notes),
       acquired_price=VALUES(acquired_price), acquired_at=VALUES(acquired_at)`,
    [card_id, quantity, condition, finish, lang, notes ?? null, acquired_price ?? null, acquired_at ?? null]
  )
  res.json({ ok: true })
}))

// DELETE /api/collection/physical/:cardId
app.delete('/api/collection/physical/:cardId', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM collection_physical WHERE card_id = ?', [req.params.cardId])
  res.json({ ok: true })
}))

// POST /api/collection/digital  body: { card_id, quantity, platform }
// Upsert: cria ou atualiza a entrada da coleção digital para uma carta/plataforma.
// quantity <= 0 remove a entrada.
app.post('/api/collection/digital', asyncHandler(async (req, res) => {
  const { card_id, quantity = 1, platform = 'arena' } = req.body
  if (!card_id) return res.status(400).json({ error: 'card_id é obrigatório' })

  if (Number(quantity) <= 0) {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ? AND platform = ?', [card_id, platform])
    return res.json({ ok: true, removed: true })
  }

  await pool.query(
    `INSERT INTO collection_digital (card_id, quantity, platform)
     VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
    [card_id, quantity, platform]
  )
  res.json({ ok: true })
}))

// DELETE /api/collection/digital/:cardId?platform=arena
// Sem platform, remove todas as entradas digitais da carta.
app.delete('/api/collection/digital/:cardId', asyncHandler(async (req, res) => {
  const { platform } = req.query
  if (platform) {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ? AND platform = ?', [req.params.cardId, platform])
  } else {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ?', [req.params.cardId])
  }
  res.json({ ok: true })
}))

// ─── IMPORT COLEÇÃO DO ARENA ─────────────────────────────────
// Body esperado: { entries: [{ name, set?, count }, ...] } — formato gerado
// pelo MTGA-collection-exporter (mtga_collection.json). Pode ter 10k+
// entradas, então roda em background (mesmo padrao do /api/sync) com
// progresso via GET /api/collection/import-progress, em vez de segurar a
// conexao HTTP e travar o event loop com milhares de queries sequenciais.

let importJob = null // { total, processed, updated, newCards, errors, done, startedAt, finishedAt }

async function runImportJob(job, byName) {
  const BATCH = 200
  const items = [...byName.entries()]

  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const [name, qty] of batch) {
        try {
          const [rows] = await conn.query('SELECT id FROM cards WHERE name = ? LIMIT 1', [name])
          let cardId
          if (rows.length) {
            cardId = rows[0].id
          } else {
            const [result] = await conn.query('INSERT INTO cards (name) VALUES (?)', [name])
            cardId = result.insertId
            job.newCards++
          }
          await conn.query(
            `INSERT INTO collection_digital (card_id, quantity, platform)
             VALUES (?, ?, 'arena')
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_at = NOW()`,
            [cardId, qty]
          )
          job.updated++
        } catch (e) {
          job.errors++
        }
        job.processed++
      }
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      job.errors += batch.length
      job.processed = Math.min(job.total, job.processed + batch.length)
    } finally {
      conn.release()
    }
  }

  job.done = true
  job.finishedAt = new Date()
}

// POST /api/collection/import-arena  body: { entries: [...] }
// Inicia a importacao em background e retorna na hora; acompanhe com
// GET /api/collection/import-progress.
app.post('/api/collection/import-arena', asyncHandler(async (req, res) => {
  const entries = req.body?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Envie { entries: [...] } com o conteúdo de mtga_collection.json' })
  }
  if (importJob && !importJob.done) {
    return res.status(409).json({ error: 'Já existe uma importação em andamento', job: importJob })
  }

  const byName = new Map()
  for (const e of entries) {
    const name = String(e?.name || '').trim()
    const count = Number(e?.count) || 0
    if (!name || count <= 0) continue
    byName.set(name, (byName.get(name) || 0) + count)
  }
  if (byName.size === 0) {
    return res.status(400).json({ error: 'Nenhuma entrada válida (name + count > 0) encontrada' })
  }

  importJob = {
    total: byName.size, processed: 0, updated: 0, newCards: 0, errors: 0,
    done: false, startedAt: new Date(), finishedAt: null,
  }

  runImportJob(importJob, byName).catch(err => {
    importJob.done = true
    importJob.finishedAt = new Date()
    importJob.errors++
  })

  res.json({ started: true, total: byName.size })
}))

// GET /api/collection/import-progress -> estado da importação em andamento (ou da última concluída)
app.get('/api/collection/import-progress', asyncHandler(async (req, res) => {
  res.json(importJob || { done: true, total: 0, processed: 0 })
}))

// ─── SCRYFALL SYNC ───────────────────────────────────────────
// Equivalente em JS do sync_scryfall.py: busca dados no Scryfall
// (cmc, color identity, preco, imagem, etc) e baixa as imagens das
// cartas. Usado pelo botao "Sincronizar" na UI apos um import de deck.

const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection'
const SCRYFALL_NAMED = 'https://api.scryfall.com/cards/named'
const SYNC_DELAY = 120 // ms entre requests (Scryfall pede >= 100ms)
const SYNC_HEADERS = { 'User-Agent': 'MTGCollectionManager/1.0', Accept: 'application/json' }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function scryfallFetchBatch(names) {
  const resp = await fetch(SCRYFALL_COLLECTION, {
    method: 'POST',
    headers: { ...SYNC_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: names.map(n => ({ name: n })) }),
  })
  const data = await resp.json()
  const result = {}
  for (const card of data.data || []) result[card.name.toLowerCase()] = card
  await sleep(SYNC_DELAY)
  return result
}

async function scryfallFetchOne(name) {
  try {
    let resp = await fetch(`${SCRYFALL_NAMED}?exact=${encodeURIComponent(name)}`, { headers: SYNC_HEADERS })
    if (resp.status === 404) {
      resp = await fetch(`${SCRYFALL_NAMED}?fuzzy=${encodeURIComponent(name)}`, { headers: SYNC_HEADERS })
    }
    await sleep(SYNC_DELAY)
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

function extractCardData(sc) {
  // Imagem: prefere 'normal'; DFC usa a face frontal
  let imgUrl = null
  if (sc.image_uris) {
    imgUrl = sc.image_uris.normal || sc.image_uris.large || sc.image_uris.small
  } else if (sc.card_faces?.[0]?.image_uris) {
    const fu = sc.card_faces[0].image_uris
    imgUrl = fu.normal || fu.large
  }

  const prices = sc.prices || {}
  const oracleText = sc.oracle_text ?? (sc.card_faces?.map(f => f.oracle_text).filter(Boolean).join('\n//\n') || null)
  const manaCost = sc.mana_cost || (sc.card_faces?.map(f => f.mana_cost).filter(Boolean).join(' // ') || null)

  return {
    scryfall_id: sc.id,
    oracle_id: sc.oracle_id ?? null,
    layout: sc.layout ?? null,
    cmc: sc.cmc ?? null,
    keywords: JSON.stringify(sc.keywords || []),
    colors: (sc.colors || []).join(',') || null,
    color_identity: (sc.color_identity || []).join(',') || null,
    type_line: sc.type_line ?? null,
    oracle_text: oracleText,
    mana_cost: manaCost,
    set_code: sc.set ?? null,
    set_name: sc.set_name ?? null,
    collector_number: sc.collector_number ?? null,
    rarity: sc.rarity ?? null,
    released_at: sc.released_at ?? null,
    artist: sc.artist ?? null,
    flavor_text: sc.flavor_text ?? null,
    edhrec_rank: sc.edhrec_rank ?? null,
    price_usd: prices.usd ?? null,
    price_usd_foil: prices.usd_foil ?? null,
    price_eur: prices.eur ?? null,
    foil: sc.foil ?? false,
    nonfoil: sc.nonfoil ?? true,
    _img_url: imgUrl,
  }
}

async function downloadCardImage(scryfallId, url) {
  const localPath = path.join(IMG_DIR, `${scryfallId}.jpg`)
  if (fs.existsSync(localPath)) return `/cards/${scryfallId}.jpg`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(localPath, buf)
    return `/cards/${scryfallId}.jpg`
  } catch {
    return null
  }
}

// ─── Job de sincronização em background (estado em memória) ───
let syncJob = null // { mode, total, processed, updated, images, errors, errorNames, done, startedAt, finishedAt }

async function runSyncJob(job, cards) {
  const BATCH = 75

  for (let start = 0; start < cards.length; start += BATCH) {
    const batch = cards.slice(start, start + BATCH)
    const idByName = new Map(batch.map(c => [c.name.toLowerCase(), c.id]))

    let scryfallData
    try {
      scryfallData = await scryfallFetchBatch(batch.map(c => c.name))
    } catch {
      scryfallData = {}
    }

    for (const [nameLower, cardId] of idByName) {
      let sc = scryfallData[nameLower]
      if (!sc) {
        const origName = batch.find(c => c.name.toLowerCase() === nameLower).name
        sc = await scryfallFetchOne(origName)
        if (!sc) { job.errors++; job.errorNames.push(origName); job.processed++; continue }
      }

      const data = extractCardData(sc)
      const imgUrl = data._img_url
      delete data._img_url

      if (imgUrl && data.scryfall_id) {
        const localImg = await downloadCardImage(data.scryfall_id, imgUrl)
        if (localImg) { data.image_uri = localImg; job.images++ }
        else data.image_uri = imgUrl
      }

      data.last_synced_at = new Date()

      const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
      const setSql = entries.map(([k]) => `${k} = ?`).join(', ')
      const values = entries.map(([, v]) => v)
      try {
        await pool.query(`UPDATE cards SET ${setSql}, updated_at = NOW() WHERE id = ?`, [...values, cardId])
        job.updated++
      } catch (err) {
        // ex: scryfall_id duplicado (carta com nome ligeiramente diferente
        // ja sincronizada sob outro registro) - nao derruba o sync inteiro
        job.errors++
        job.errorNames.push(`${batch.find(c => c.id === cardId)?.name || cardId}: ${err.sqlMessage || err.message}`)
      }
      job.processed++
    }
  }

  // Recalcula tags automaticas (keywords + heuristicas funcionais) com os
  // dados recem-sincronizados, para que cartas importadas/sincronizadas ja
  // apareçam com flying/ramp/draw/etc sem acao manual.
  try {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const [name, def] of Object.entries(AUTO_TAGS)) await applyAutoTag(conn, name, def)
      await syncKeywordTags(conn)
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (err) {
    job.errorNames.push(`Recalculo de tags falhou: ${err.message}`)
  }

  job.done = true
  job.finishedAt = new Date()
}

// POST /api/sync  body: { mode: 'new' | 'all' }  (default 'new')
// 'new'  -> so cartas com scryfall_id IS NULL (ex: apos importar um deck)
// 'all'  -> ressincroniza todas as cartas (precos, imagens, etc) em background, com progresso via /api/sync/progress
app.post('/api/sync', asyncHandler(async (req, res) => {
  const mode = req.body?.mode === 'all' ? 'all' : 'new'

  if (syncJob && !syncJob.done) {
    return res.status(409).json({ error: 'Já existe uma sincronização em andamento', job: syncJob })
  }

  const [cards] = await pool.query(
    mode === 'all'
      ? 'SELECT id, name FROM cards ORDER BY name'
      : 'SELECT id, name FROM cards WHERE scryfall_id IS NULL ORDER BY name'
  )

  syncJob = {
    mode, total: cards.length, processed: 0, updated: 0, images: 0,
    errors: 0, errorNames: [], done: false, startedAt: new Date(), finishedAt: null,
  }

  // roda em background, nao bloqueia a resposta
  runSyncJob(syncJob, cards).catch(err => {
    syncJob.done = true
    syncJob.finishedAt = new Date()
    syncJob.errors++
    syncJob.errorNames.push(`Job interrompido: ${err.message}`)
  })

  res.json({ started: true, mode, total: cards.length })
}))

// GET /api/sync/progress -> estado da sincronização em andamento (ou da última concluída)
app.get('/api/sync/progress', asyncHandler(async (req, res) => {
  res.json(syncJob || { done: true, total: 0, processed: 0 })
}))

// GET /api/sync/status -> quantas cartas ainda nao foram sincronizadas + ultima sync
app.get('/api/sync/status', asyncHandler(async (req, res) => {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM cards')
  const [[{ unsynced }]] = await pool.query('SELECT COUNT(*) AS unsynced FROM cards WHERE scryfall_id IS NULL')
  const [[{ oldestSync }]] = await pool.query('SELECT MIN(last_synced_at) AS oldestSync FROM cards')
  res.json({ total, unsynced, oldestSync })
}))

// ─── MATCHES (MTGA Tracker) ────────────────────────────────────

// POST /api/matches { arena_match_id, opponent_name, started_at, deck_arena_ids: [123, ...], event_name, commander_name }
// Detecta o deck por overlap de arena_id com deck_cards (decks platform='arena')
app.post('/api/matches', asyncHandler(async (req, res) => {
  const { arena_match_id, opponent_name, started_at, deck_arena_ids = [], event_name, commander_name } = req.body

  let deckId = null
  if (deck_arena_ids.length) {
    const [rows] = await pool.query(`
      SELECT dc.deck_id, COUNT(*) AS overlap
      FROM deck_cards dc
      JOIN cards c ON c.id = dc.card_id
      JOIN decks d ON d.id = dc.deck_id
      WHERE d.platform = 'arena' AND d.is_active = 1
        AND dc.board = 'main' AND c.arena_id IN (?)
      GROUP BY dc.deck_id
      ORDER BY overlap DESC
      LIMIT 1
    `, [deck_arena_ids])
    if (rows.length && rows[0].overlap / deck_arena_ids.length >= 0.8) {
      deckId = rows[0].deck_id
    }
  }

  await pool.query(`
    INSERT INTO matches (arena_match_id, deck_id, opponent_name, started_at, event_name, commander_name, result)
    VALUES (?, ?, ?, ?, ?, ?, 'in_progress')
    ON DUPLICATE KEY UPDATE deck_id = VALUES(deck_id), opponent_name = VALUES(opponent_name),
      started_at = VALUES(started_at), event_name = VALUES(event_name), commander_name = VALUES(commander_name)
  `, [arena_match_id, deckId, opponent_name, new Date(started_at), event_name || null, commander_name || null])

  const [[row]] = await pool.query('SELECT id, deck_id FROM matches WHERE arena_match_id = ?', [arena_match_id])
  res.json(row)
}))

// PATCH /api/matches/:id { result, ended_at, total_turns, on_play }
app.patch('/api/matches/:id', asyncHandler(async (req, res) => {
  const { result, ended_at, total_turns, on_play } = req.body
  await pool.query(
    'UPDATE matches SET result = ?, ended_at = ?, total_turns = ?, on_play = ? WHERE id = ?',
    [result, new Date(ended_at), total_turns ?? null, on_play ?? null, req.params.id]
  )
  res.json({ ok: true })
}))

// DELETE /api/matches/:id — remove uma partida do histórico
app.delete('/api/matches/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM matches WHERE id = ?', [req.params.id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Partida não encontrada' })
  res.json({ ok: true, removed: true })
}))

// GET /api/matches?deck_id=&limit=
app.get('/api/matches', asyncHandler(async (req, res) => {
  const { deck_id, limit = 50 } = req.query
  let where = '1=1'
  const params = []
  if (deck_id) { where += ' AND m.deck_id = ?'; params.push(deck_id) }
  params.push(Number(limit))

  const [rows] = await pool.query(`
    SELECT m.id, m.arena_match_id, m.opponent_name, m.started_at, m.ended_at, m.result,
           m.event_name, m.commander_name, m.total_turns, m.on_play,
           d.id AS deck_id, d.name AS deck_name, d.color_identity AS deck_color_identity
    FROM matches m
    LEFT JOIN decks d ON d.id = m.deck_id
    WHERE ${where}
    ORDER BY m.started_at DESC
    LIMIT ?
  `, params)
  res.json(rows)
}))

// POST /api/sync-log { message }
app.post('/api/sync-log', asyncHandler(async (req, res) => {
  const { message } = req.body
  const [result] = await pool.query('INSERT INTO sync_log (message) VALUES (?)', [String(message || '').slice(0, 255)])
  res.json({ id: result.insertId })
}))

// GET /api/sync-log?since_id=
app.get('/api/sync-log', asyncHandler(async (req, res) => {
  const { since_id = 0 } = req.query
  const [rows] = await pool.query(
    'SELECT id, created_at, message FROM sync_log WHERE id > ? ORDER BY id ASC LIMIT 200',
    [Number(since_id)]
  )
  res.json(rows)
}))

// ─── SCANNER (cartas físicas via câmera) ──────────────────────

// Distância de Hamming entre dois hashes hex de 64 bits
function hammingDistance(hexA, hexB) {
  let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB)
  let count = 0
  while (x) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

// POST /api/scan { phash: "16 hex chars" } → top 5 cards mais próximos por dHash
app.post('/api/scan', asyncHandler(async (req, res) => {
  const { phash } = req.body
  if (!/^[0-9a-f]{16}$/i.test(phash || '')) {
    return res.status(400).json({ error: 'phash inválido (esperado hex de 16 chars)' })
  }

  const [rows] = await pool.query(`
    SELECT id, name, set_code, set_name, collector_number, image_uri, phash
    FROM cards WHERE phash IS NOT NULL
  `)

  const top = rows
    .map(r => ({ ...r, distance: hammingDistance(phash, r.phash) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ phash, ...r }) => r)

  res.json(top)
}))

// ─── HELPERS ─────────────────────────────────────────────────

function getTypeGroup(typeLine) {
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

function parseCmc(manaCost) {
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

function buildStats(cards) {
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
function classifyCard(card) {
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
const DECK_TEMPLATE = {
  lands:   { min: 35, max: 38, label: 'Terrenos' },
  ramp:    { min: 8,  max: 12, label: 'Ramp' },
  draw:    { min: 8,  max: 12, label: 'Card draw' },
  removal: { min: 5,  max: 10, label: 'Remoção pontual' },
  wipe:    { min: 2,  max: 4,  label: 'Board wipes' },
}

function buildAnalysis(cards, deck) {
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

// 404 para rotas nao encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── ERROR HANDLER ───────────────────────────────────────────
// Middleware final: captura erros encaminhados por asyncHandler/next(err)
// e responde com JSON em vez de derrubar o processo.
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err)
  res.status(500).json({
    error: 'Internal server error',
    detail: err.sqlMessage || err.message || String(err),
  })
})

// Rede de seguranca extra: nunca deixa o processo morrer por erro nao tratado
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err)
})
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

const PORT = 3001
app.listen(PORT, () => console.log(`MTG API running on http://localhost:${PORT}`))
