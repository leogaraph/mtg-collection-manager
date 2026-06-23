import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { getTypeGroup, buildStats, buildAnalysis } from '../lib/deckAnalysis.js'
import { edhrecCache, CACHE_TTL, toEdhrecSlug, parseEdhrecSuggestions } from '../lib/edhrec.js'

const router = express.Router()

// GET /api/decks
router.get('/', asyncHandler(async (req, res) => {
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
router.get('/:id', asyncHandler(async (req, res) => {
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
router.post('/', asyncHandler(async (req, res) => {
  const { slug, name, format = 'commander', platform = 'arena' } = req.body
  try {
    const [result] = await pool.query(
      'INSERT INTO decks (slug, name, format, platform) VALUES (?,?,?,?)',
      [slug, name, format, platform]
    )
    res.json({ id: result.insertId, slug, name, format, platform })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Já existe um deck com o slug "${slug}"` })
    }
    throw e
  }
}))

// PATCH /api/decks/:id  body: { name?, slug?, format?, platform?, description? }
router.patch('/:id', asyncHandler(async (req, res) => {
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
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
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
router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('UPDATE decks SET is_active = 0 WHERE id = ?', [req.params.id])
  res.json({ ok: true })
}))

// POST /api/decks/import
// Importa um deck colado no formato Arena/Moxfield:
//   Deck / Commander / Sideboard como cabecalhos de secao
//   "1 Sol Ring (CMM) 234"  ou simplesmente "1 Sol Ring"
// Cartas que nao existem no banco sao criadas (so com o nome) para
// serem sincronizadas depois com `sync_scryfall.py --new`.
router.post('/import', asyncHandler(async (req, res) => {
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
router.post('/:id/cards', asyncHandler(async (req, res) => {
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
router.patch('/:id/cards/:cardId', asyncHandler(async (req, res) => {
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
router.delete('/:id/cards/:cardId', asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM deck_cards WHERE deck_id=? AND card_id=?',
    [req.params.id, req.params.cardId]
  )
  res.json({ ok: true })
}))

// GET /api/decks/:id/export  — formato Arena
router.get('/:id/export', asyncHandler(async (req, res) => {
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

// GET /api/decks/:id/suggestions?limit=30
router.get('/:id/suggestions', asyncHandler(async (req, res) => {
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

export default router
