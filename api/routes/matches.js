import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

const router = express.Router()

// POST /api/matches { arena_match_id, opponent_name, started_at, deck_arena_ids: [123, ...], event_name, commander_name }
// Detecta o deck por overlap de arena_id com deck_cards (decks platform='arena')
router.post('/', asyncHandler(async (req, res) => {
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
router.patch('/:id', asyncHandler(async (req, res) => {
  const { result, ended_at, total_turns, on_play } = req.body
  await pool.query(
    'UPDATE matches SET result = ?, ended_at = ?, total_turns = ?, on_play = ? WHERE id = ?',
    [result, new Date(ended_at), total_turns ?? null, on_play ?? null, req.params.id]
  )
  res.json({ ok: true })
}))

// DELETE /api/matches/:id — remove uma partida do histórico
router.delete('/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM matches WHERE id = ?', [req.params.id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Partida não encontrada' })
  res.json({ ok: true, removed: true })
}))

// GET /api/matches?deck_id=&limit=
router.get('/', asyncHandler(async (req, res) => {
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

export default router
