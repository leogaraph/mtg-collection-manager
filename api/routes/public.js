// ─── Rotas PÚBLICAS — sem requireAuth, de propósito ────────────────────────
//
// Feed de "últimos decks cadastrados" + decklist somente-leitura, no
// espírito do EDHREC/MTGGoldfish/MTGDecks: qualquer um pode ver, só quem
// loga pode criar/editar (isso já é garantido pelas rotas normais em
// decks.js, que continuam atrás de requireAuth). Não expõe nada por-usuário
// (coleção, tags, email) — só o que já é público por natureza numa decklist.
import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { getTypeGroup, buildStats, buildAnalysis } from '../lib/deckAnalysis.js'

const router = express.Router()

// GET /api/public/decks?limit=24&offset=0&format=commander
router.get('/decks', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const format = req.query.format || null

  const where = ['d.is_active = 1']
  const params = []
  if (format) { where.push('d.format = ?'); params.push(format) }
  const whereSql = `WHERE ${where.join(' AND ')}`

  const [decks] = await pool.query(`
    SELECT d.id, d.name, d.slug, d.format, d.color_identity, d.platform, d.created_at,
           COUNT(DISTINCT dc.id) AS card_count,
           SUM(CASE WHEN c.rarity = 'mythic' THEN dc.quantity ELSE 0 END) AS mythic_count,
           SUM(CASE WHEN c.rarity = 'rare'   THEN dc.quantity ELSE 0 END) AS rare_count,
           c1.name AS commander_name, c1.image_uri AS commander_image,
           u.name AS owner_name,

           -- "Spiciness": % das cartas não-terreno do main que NÃO são #staple
           -- (edhrec_rank <= 1000 do dono) — quanto mais alto, mais rogue/brew
           -- é o deck em vez de netdeck de cartas óbvias.
           (SELECT COUNT(DISTINCT dc2.card_id) FROM deck_cards dc2 JOIN cards c2 ON c2.id = dc2.card_id
             WHERE dc2.deck_id = d.id AND dc2.board = 'main' AND c2.type_line NOT LIKE '%Land%'
           ) AS nonland_count,
           (SELECT COUNT(DISTINCT dc2.card_id) FROM deck_cards dc2 JOIN cards c2 ON c2.id = dc2.card_id
             WHERE dc2.deck_id = d.id AND dc2.board = 'main' AND c2.type_line NOT LIKE '%Land%'
               AND NOT EXISTS (
                 SELECT 1 FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
                 WHERE ct.card_id = dc2.card_id AND ct.user_id = d.user_id AND t.name = 'staple'
               )
           ) AS spicy_count,

           -- top 3 tags do dono que descrevem o deck (staple/meta ficam de
           -- fora — são sinal de popularidade, não de identidade do deck)
           (SELECT GROUP_CONCAT(tag_name ORDER BY score DESC SEPARATOR ',') FROM (
              SELECT t.name AS tag_name, SUM(dc3.quantity * ct3.weight) AS score
              FROM deck_cards dc3
              JOIN card_tags ct3 ON ct3.card_id = dc3.card_id AND ct3.user_id = d.user_id
              JOIN tags t ON t.id = ct3.tag_id AND (t.category IS NULL OR t.category != 'meta')
              WHERE dc3.deck_id = d.id AND dc3.board = 'main'
              GROUP BY t.name ORDER BY score DESC LIMIT 3
            ) top3
           ) AS top_tags
    FROM decks d
    LEFT JOIN deck_cards dc ON dc.deck_id = d.id
    LEFT JOIN cards c ON c.id = dc.card_id
    LEFT JOIN cards c1 ON c1.id = d.commander_id
    JOIN users u ON u.id = d.user_id
    ${whereSql}
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset])

  for (const d of decks) {
    d.spiciness = d.nonland_count > 0 ? Math.round(100 * d.spicy_count / d.nonland_count) : null
    d.top_tags = d.top_tags ? d.top_tags.split(',') : []
    delete d.nonland_count
    delete d.spicy_count
  }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM decks d ${whereSql}`, params)

  // contagem por formato + total de pilotos, pra vitrine mostrar de cara o
  // tamanho real da comunidade sem esconder atrás de um filtro
  const [byFormat] = await pool.query(`
    SELECT format, COUNT(*) AS n FROM decks WHERE is_active = 1 GROUP BY format ORDER BY n DESC
  `)
  const [[{ pilots }]] = await pool.query(`
    SELECT COUNT(DISTINCT user_id) AS pilots FROM decks WHERE is_active = 1
  `)

  res.json({ decks, total, byFormat, pilots })
}))

// GET /api/public/decks/:id — decklist completa, somente leitura
router.get('/decks/:id', asyncHandler(async (req, res) => {
  const [[deck]] = await pool.query(`
    SELECT d.id, d.user_id, d.name, d.slug, d.format, d.color_identity, d.platform, d.created_at, d.description,
           c.name AS commander_name, c.image_uri AS commander_image,
           c.color_identity AS commander_color_identity,
           u.name AS owner_name
    FROM decks d
    LEFT JOIN cards c ON c.id = d.commander_id
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.is_active = 1
  `, [req.params.id])
  if (!deck) return res.status(404).json({ error: 'Not found' })

  // tags são por usuário — aqui usamos as do DONO do deck (só ele definiu o
  // que essas cartas significam), nunca as de quem está vendo a página
  const [cards] = await pool.query(`
    SELECT c.id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity, c.produced_mana,
           c.type_line, c.oracle_text, c.rarity, c.set_code, c.image_uri,
           c.power, c.toughness, c.loyalty, c.price_usd,
           dc.quantity, dc.board,
           GROUP_CONCAT(DISTINCT CONCAT(t.name, ':', ct.weight) ORDER BY t.name) AS tags_w
    FROM deck_cards dc
    JOIN cards c ON c.id = dc.card_id
    LEFT JOIN card_tags ct ON ct.card_id = c.id AND ct.user_id = ?
    LEFT JOIN tags t ON t.id = ct.tag_id
    WHERE dc.deck_id = ?
    GROUP BY dc.id
    ORDER BY c.type_line, c.name
  `, [deck.user_id, deck.id])

  const grouped = {}
  const tagScores = {}
  let nonlandCount = 0, spicyCount = 0, mythicCount = 0, rareCount = 0

  for (const card of cards) {
    const board = card.board || 'main'
    if (!grouped[board]) grouped[board] = {}
    const typeGroup = getTypeGroup(card.type_line)
    if (!grouped[board][typeGroup]) grouped[board][typeGroup] = []

    const tagWeights = card.tags_w ? card.tags_w.split(',').map(p => { const [n, w] = p.split(':'); return [n, Number(w)] }) : []
    card.tags = tagWeights.map(([n]) => n)
    delete card.tags_w
    grouped[board][typeGroup].push(card)

    if (board !== 'main') continue
    if (card.rarity === 'mythic') mythicCount += card.quantity
    if (card.rarity === 'rare') rareCount += card.quantity
    const isLand = (card.type_line || '').toLowerCase().includes('land')
    if (!isLand) {
      nonlandCount++
      if (!tagWeights.some(([n]) => n === 'staple')) spicyCount++
      for (const [name, weight] of tagWeights) {
        if (name === 'staple' || name === 'meta') continue
        tagScores[name] = (tagScores[name] || 0) + card.quantity * weight
      }
    }
  }

  const topTags = Object.entries(tagScores).sort(([, a], [, b]) => b - a).slice(0, 5).map(([n]) => n)
  const spiciness = nonlandCount > 0 ? Math.round(100 * spicyCount / nonlandCount) : null

  const mainCards = cards.filter(c => c.board === 'main')
  const stats = buildStats(mainCards)
  const analysis = buildAnalysis(mainCards, deck)

  const { user_id, ...publicDeck } = deck
  res.json({ ...publicDeck, cards, grouped, stats, analysis, mythicCount, rareCount, spiciness, topTags })
}))

export default router
