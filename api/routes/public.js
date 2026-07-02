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

// GET /api/public/decks?limit=24&offset=0
router.get('/decks', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const [decks] = await pool.query(`
    SELECT d.id, d.name, d.slug, d.format, d.color_identity, d.platform, d.created_at,
           COUNT(dc.id) AS card_count,
           c.name AS commander_name, c.image_uri AS commander_image,
           u.name AS owner_name
    FROM decks d
    LEFT JOIN deck_cards dc ON dc.deck_id = d.id
    LEFT JOIN cards c ON c.id = d.commander_id
    JOIN users u ON u.id = d.user_id
    WHERE d.is_active = 1
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset])

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM decks WHERE is_active = 1')

  res.json({ decks, total })
}))

// GET /api/public/decks/:id — decklist completa, somente leitura
router.get('/decks/:id', asyncHandler(async (req, res) => {
  const [[deck]] = await pool.query(`
    SELECT d.id, d.name, d.slug, d.format, d.color_identity, d.platform, d.created_at, d.description,
           c.name AS commander_name, c.image_uri AS commander_image,
           c.color_identity AS commander_color_identity,
           u.name AS owner_name
    FROM decks d
    LEFT JOIN cards c ON c.id = d.commander_id
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.is_active = 1
  `, [req.params.id])
  if (!deck) return res.status(404).json({ error: 'Not found' })

  const [cards] = await pool.query(`
    SELECT c.id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity, c.produced_mana,
           c.type_line, c.oracle_text, c.rarity, c.set_code, c.image_uri,
           c.power, c.toughness, c.loyalty, c.price_usd,
           dc.quantity, dc.board
    FROM deck_cards dc
    JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = ?
    ORDER BY c.type_line, c.name
  `, [deck.id])

  const grouped = {}
  for (const card of cards) {
    const board = card.board || 'main'
    if (!grouped[board]) grouped[board] = {}
    const typeGroup = getTypeGroup(card.type_line)
    if (!grouped[board][typeGroup]) grouped[board][typeGroup] = []
    grouped[board][typeGroup].push(card)
  }

  const mainCards = cards.filter(c => c.board === 'main')
  const stats = buildStats(mainCards)
  const analysis = buildAnalysis(mainCards, deck)

  res.json({ ...deck, cards, grouped, stats, analysis })
}))

export default router
