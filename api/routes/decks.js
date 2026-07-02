import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getTypeGroup, buildStats, buildAnalysis } from '../lib/deckAnalysis.js'
import { edhrecCache, CACHE_TTL, toEdhrecSlug, parseEdhrecSuggestions, normalizeCardName } from '../lib/edhrec.js'
import { checkArenaLegality } from '../lib/arenaLegality.js'

const router = express.Router()
router.use(requireAuth)

// Carrega um deck garantindo que pertence ao usuário autenticado.
// Em caso contrário (não existe OU é de outro usuário), responde 404 —
// nunca 403, para não revelar a outros usuários que o id/slug existe.
async function loadOwnedDeck(req, res) {
  const [[deck]] = await pool.query('SELECT * FROM decks WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
  if (!deck) {
    res.status(404).json({ error: 'Not found' })
    return null
  }
  return deck
}

// GET /api/decks
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT d.*,
           COUNT(dc.id) AS card_count,
           c.name AS commander_name, c.image_uri AS commander_image
    FROM decks d
    LEFT JOIN deck_cards dc ON dc.deck_id = d.id
    LEFT JOIN cards c ON c.id = d.commander_id
    WHERE d.is_active = 1 AND d.user_id = ?
    GROUP BY d.id
    ORDER BY d.name
  `, [req.userId])
  res.json(rows)
}))

// GET /api/decks/:id  — deck completo com cartas agrupadas por tipo
router.get('/:id', asyncHandler(async (req, res) => {
  let [[deck]] = await pool.query(`
    SELECT d.*, c.name AS commander_name, c.image_uri AS commander_image,
           c.colors AS commander_colors, c.color_identity AS commander_color_identity
    FROM decks d
    LEFT JOIN cards c ON c.id = d.commander_id
    WHERE d.id = ? AND d.user_id = ?`, [req.params.id, req.userId])

  if (!deck) {
    // tenta por slug (unico por usuario, entao o filtro user_id ja basta)
    const [[bySlug]] = await pool.query(
      `SELECT d.*, c.name AS commander_name, c.image_uri AS commander_image,
              c.colors AS commander_colors, c.color_identity AS commander_color_identity
       FROM decks d
       LEFT JOIN cards c ON c.id = d.commander_id
       WHERE d.slug = ? AND d.user_id = ?`, [req.params.id, req.userId])
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
    LEFT JOIN card_tags ct ON ct.card_id = c.id AND ct.user_id = ?
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE dc.deck_id = ?
    GROUP BY dc.id
    ORDER BY c.type_line, c.name`, [req.userId, deck.id])
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
      'INSERT INTO decks (user_id, slug, name, format, platform) VALUES (?,?,?,?,?)',
      [req.userId, slug, name, format, platform]
    )
    res.json({ id: result.insertId, slug, name, format, platform })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Você já tem um deck com o slug "${slug}"` })
    }
    throw e
  }
}))

// PATCH /api/decks/:id  body: { name?, slug?, format?, platform?, description? }
router.patch('/:id', asyncHandler(async (req, res) => {
  if (!(await loadOwnedDeck(req, res))) return

  const fields = ['name', 'slug', 'format', 'platform', 'description']
  const updates = fields.filter(f => req.body[f] !== undefined)
  if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })

  await pool.query(
    `UPDATE decks SET ${updates.map(f => `${f} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
    [...updates.map(f => req.body[f]), req.params.id, req.userId]
  )
  const [[deck]] = await pool.query('SELECT * FROM decks WHERE id = ?', [req.params.id])
  res.json(deck)
}))

// POST /api/decks/:id/duplicate
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const deck = await loadOwnedDeck(req, res)
  if (!deck) return

  const baseSlug = `${deck.slug}-copia`
  let slug = baseSlug
  let n = 1
  while (true) {
    const [[exists]] = await pool.query('SELECT id FROM decks WHERE slug = ? AND user_id = ?', [slug, req.userId])
    if (!exists) break
    n += 1
    slug = `${baseSlug}-${n}`
  }

  const [result] = await pool.query(
    'INSERT INTO decks (user_id, slug, name, format, commander_id, color_identity, platform, description) VALUES (?,?,?,?,?,?,?,?)',
    [req.userId, slug, `${deck.name} (cópia)`, deck.format, deck.commander_id, deck.color_identity, deck.platform, deck.description]
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
  if (!(await loadOwnedDeck(req, res))) return
  await pool.query('UPDATE decks SET is_active = 0 WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
  res.json({ ok: true })
}))

// POST /api/decks/import
// Importa um deck colado no formato Arena/Moxfield:
//   Deck / Commander / Sideboard como cabecalhos de secao
//   "1 Sol Ring (CMM) 234"  ou simplesmente "1 Sol Ring"
// Cartas que nao existem no banco sao criadas (so com o nome) para
// serem sincronizadas depois com `sync_scryfall.py --new`. As cartas em
// si sao catalogo GLOBAL (compartilhado); so o deck/deck_cards e' do usuario.
router.post('/import', asyncHandler(async (req, res) => {
  const { name, slug: slugIn, format = 'commander', platform = 'arena', text = '' } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do deck e obrigatorio' })
  if (!text || !text.trim()) return res.status(400).json({ error: 'Cole a lista de cartas' })

  // gera slug a partir do nome, garantindo unicidade DENTRO do usuario
  const baseSlug = (slugIn || name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'deck'

  let slug = baseSlug
  for (let i = 2; ; i++) {
    const [rows] = await pool.query('SELECT id FROM decks WHERE slug = ? AND user_id = ?', [slug, req.userId])
    if (!rows.length) break
    slug = `${baseSlug}-${i}`
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [deckResult] = await conn.query(
      'INSERT INTO decks (user_id, slug, name, format, platform) VALUES (?,?,?,?,?)',
      [req.userId, slug, name.trim(), format, platform]
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
  if (!(await loadOwnedDeck(req, res))) return
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
  if (!(await loadOwnedDeck(req, res))) return
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
  if (!(await loadOwnedDeck(req, res))) return
  await pool.query(
    'DELETE FROM deck_cards WHERE deck_id=? AND card_id=?',
    [req.params.id, req.params.cardId]
  )
  res.json({ ok: true })
}))

// GET /api/decks/:id/export  — formato Arena
router.get('/:id/export', asyncHandler(async (req, res) => {
  if (!(await loadOwnedDeck(req, res))) return

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

  // deck + commander (so do usuario atual)
  const [[deck]] = await pool.query(
    `SELECT d.id, d.name, d.commander_id, d.platform,
            c.name AS commander_name,
            c.color_identity AS commander_color_identity
     FROM decks d LEFT JOIN cards c ON c.id = d.commander_id
     WHERE d.id = ? AND d.user_id = ?`,
    [req.params.id, req.userId]
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
  const deckCardNames = new Set(deckCards.map(c => normalizeCardName(c.name)))
  deckCardNames.add(normalizeCardName(deck.commander_name))

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
              c.rarity, c.oracle_text, c.power, c.toughness, c.loyalty, c.arena_id,
              GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags
       FROM cards c
       LEFT JOIN card_tags ct ON ct.card_id = c.id AND ct.user_id = ?
       LEFT JOIN tags t ON t.id = ct.tag_id
       WHERE c.name IN (${placeholders})
       GROUP BY c.id`,
      [req.userId, ...names]
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
        s.arenaLegal   = col.arena_id != null
      } else {
        s.inCollection = false
        s.tags = []
        s.arenaLegal = null // desconhecido ate a checagem abaixo (so p/ decks Arena)
      }
    }
  }

  // Deck e' Arena-only: cartas que so existem em papel nao servem pra nada
  // aqui. Cartas ja na colecao ja tem resposta definitiva (arena_id local);
  // as demais sao checadas em lote na Scryfall (cacheado por dias). Falha
  // aberta: se a checagem der erro, mantem a sugestao em vez de escondê-la.
  if (deck.platform === 'arena') {
    const namesToCheck = topSlice.filter(s => s.arenaLegal === null).map(s => s.name)
    if (namesToCheck.length > 0) {
      const legality = await checkArenaLegality(namesToCheck)
      for (const s of topSlice) {
        if (s.arenaLegal === null) {
          const v = legality.get(s.name.toLowerCase())
          s.arenaLegal = v === undefined ? null : v
        }
      }
    }
  }

  const filtered = deck.platform === 'arena'
    ? topSlice.filter(s => s.arenaLegal !== false)
    : topSlice
  const results = filtered.slice(0, limit)
  res.json({ suggestions: results, total: all.length, source: 'edhrec', slug })
}))

// GET /api/decks/:id/tag-suggestions?limit=30
// Sugestao por sinergia de tags: pondera quanto cada tag do deck (main
// board) pesa — usando card_tags.weight, nao so contagem bruta — e ranqueia
// cartas da SUA coleção (fora do deck, com color identity compativel) pela
// soma ponderada das tags que compartilham com o deck. O peso existe pra
// tags "goodstuff" (staple/meta) nao dominarem o ranking so por serem
// comuns — elas tem weight baixo (ver AUTO_TAGS em autoTags.js), entao um
// match de "sacrifice" (weight 100) vale muito mais que um de "staple"
// (weight 15). Candidatos que cobrem uma categoria que o Deck Doctor
// marcou como deficiente (ramp/draw/removal/wipe baixos) recebem um boost.
router.get('/:id/tag-suggestions', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100)
  // Terrenos utilitarios (Command Tower, Evolving Wilds...) tendem a
  // carregar varias tags em comum (ramp/staple/meta) e dominar o topo do
  // ranking, mas o deck raramente precisa de mais que 2-3 sugeridos por
  // vez. maxLands limita quantos aparecem no resultado.
  const maxLands = Math.min(Number(req.query.maxLands) || 3, limit)
  const DEFICIT_BOOST = 1.5 // multiplicador pra tags que cobrem um "baixo" do Deck Doctor

  const [[deck]] = await pool.query(
    `SELECT d.id, d.color_identity, c.color_identity AS commander_color_identity
     FROM decks d LEFT JOIN cards c ON c.id = d.commander_id
     WHERE d.id = ? AND d.user_id = ?`,
    [req.params.id, req.userId]
  )
  if (!deck) return res.status(404).json({ error: 'Not found' })

  // alertas do Deck Doctor (ramp/draw/removal/wipe baixos) -> quais tags
  // merecem boost nesse deck especificamente
  const [mainCards] = await pool.query(
    `SELECT c.id, c.type_line, c.oracle_text, c.mana_cost, c.cmc, c.colors, c.produced_mana, dc.quantity
     FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
     WHERE dc.deck_id = ? AND dc.board = 'main'`,
    [deck.id]
  )
  const { warnings } = buildAnalysis(mainCards, deck)
  const deficientTags = new Set(
    warnings.filter(w => w.level === 'low' && ['ramp', 'draw', 'removal', 'wipe'].includes(w.key)).map(w => w.key)
  )

  // tagCounts (bruto, pra UI) + tagStrength (ponderado por weight, pro score)
  const [tagRows] = await pool.query(
    `SELECT t.name, SUM(dc.quantity) AS qty, SUM(dc.quantity * ct.weight) AS strength
     FROM deck_cards dc
     JOIN card_tags ct ON ct.card_id = dc.card_id AND ct.user_id = ?
     JOIN tags t ON t.id = ct.tag_id
     WHERE dc.deck_id = ? AND dc.board = 'main'
     GROUP BY t.name`,
    [req.userId, deck.id]
  )
  // SUM() do MySQL volta como string via mysql2 — forca Number aqui pra
  // nao virar concatenacao de texto no reduce do score mais abaixo
  const tagCounts = Object.fromEntries(tagRows.map(r => [r.name, Number(r.qty)]))
  const tagStrength = Object.fromEntries(tagRows.map(r => [r.name, Number(r.strength) / 100]))

  if (Object.keys(tagCounts).length === 0) {
    return res.json({ suggestions: [], tagCounts, reason: 'Deck sem cartas com tags ainda — adicione tags ou rode /tags/auto' })
  }

  // ?tags=ramp,sacrifice -> usuario selecionou um subconjunto das tags do
  // deck na UI; restringe pontuacao/candidatos so a essas (intersecao com
  // as tags que o deck de fato tem, ignora o resto). Importante distinguir
  // "parametro tags ausente" (usa tudo, comportamento padrao) de "tags
  // informadas mas nenhuma bateu" (deve retornar vazio, nao cair pro
  // padrao silenciosamente).
  const requestedTags = req.query.tags
    ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []
  const selectedTags = requestedTags.filter(t => tagCounts[t] !== undefined)
  const activeTagNames = requestedTags.length ? selectedTags : Object.keys(tagCounts)
  const activeTagCounts = Object.fromEntries(activeTagNames.map(t => [t, tagCounts[t]]))

  if (Object.keys(activeTagCounts).length === 0) {
    return res.json({ suggestions: [], tagCounts, reason: 'Nenhuma das tags selecionadas está presente no deck' })
  }

  // candidatos: na colecao do usuario (digital ou fisica), com pelo menos
  // uma tag em comum, ainda nao no deck. tags_w carrega "nome:weight" pra
  // dar pra ponderar o score sem outra query.
  const [candidates] = await pool.query(
    `SELECT c.id, c.name, c.mana_cost, c.type_line, c.image_uri, c.rarity,
            c.color_identity, c.oracle_text, c.power, c.toughness, c.loyalty,
            GROUP_CONCAT(DISTINCT CONCAT(t.name, ':', ct.weight) ORDER BY t.name) AS tags_w
     FROM cards c
     JOIN card_tags ct ON ct.card_id = c.id AND ct.user_id = ?
     JOIN tags t ON t.id = ct.tag_id
     WHERE t.name IN (?)
       AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.deck_id = ? AND dc.card_id = c.id)
       AND (
         EXISTS (SELECT 1 FROM collection_digital  cd WHERE cd.card_id = c.id AND cd.user_id = ?)
         OR EXISTS (SELECT 1 FROM collection_physical cp WHERE cp.card_id = c.id AND cp.user_id = ?)
       )
     GROUP BY c.id`,
    [req.userId, activeTagNames, deck.id, req.userId, req.userId]
  )

  // filtro de color identity: carta valida se toda cor dela esta na identidade do deck
  const deckCI = (deck.color_identity || deck.commander_color_identity || '').split(',').filter(Boolean)
  const validColors = new Set(deckCI)

  const scored = candidates
    .map(c => {
      const tagWeights = c.tags_w
        ? c.tags_w.split(',').map(pair => { const [name, w] = pair.split(':'); return [name, Number(w)] })
        : []
      const tags = tagWeights.map(([name]) => name)
      const matchedTags = tags.filter(t => activeTagCounts[t] !== undefined)
      const boostedTags = matchedTags.filter(t => deficientTags.has(t))
      let score = 0
      for (const [name, weight] of tagWeights) {
        if (activeTagCounts[name] === undefined) continue
        const contribution = tagStrength[name] * (weight / 100)
        score += deficientTags.has(name) ? contribution * DEFICIT_BOOST : contribution
      }
      const { tags_w, ...rest } = c
      return { ...rest, tags, matchedTags, boostedTags, score: Math.round(score * 10) / 10 }
    })
    .filter(c => {
      const cardColors = (c.color_identity || '').split(',').filter(Boolean)
      return cardColors.every(col => validColors.has(col))
    })
    .sort((a, b) => b.score - a.score)

  // limita terrenos a maxLands, sem reduzir o total de sugestoes — as
  // vagas que sobrarem vao para o melhor nao-terreno seguinte na lista
  const isLand = c => (c.type_line || '').toLowerCase().includes('land')
  const cappedLands = scored.filter(isLand).slice(0, maxLands)
  const nonLands = scored.filter(c => !isLand(c))
  const results = [...nonLands, ...cappedLands]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  res.json({ suggestions: results, tagCounts, deficientTags: [...deficientTags], source: 'tags' })
}))

export default router
