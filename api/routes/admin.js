import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = express.Router()

router.use(requireAuth, requireAdmin)

// GET /api/admin/users — lista usuarios cadastrados com contagem de decks/cartas
router.get('/users', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      u.id, u.email, u.name, u.is_admin, u.created_at,
      (SELECT COUNT(*) FROM decks d WHERE d.user_id = u.id) AS deck_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM collection_digital cd WHERE cd.user_id = u.id) AS digital_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM collection_physical cp WHERE cp.user_id = u.id) AS physical_count,
      (SELECT COUNT(*) FROM matches m WHERE m.user_id = u.id) AS match_count
    FROM users u
    ORDER BY u.created_at DESC
  `)
  res.json(rows)
}))

// PATCH /api/admin/users/:id { is_admin } — promove/revoga admin
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.userId) return res.status(400).json({ error: 'Não é possível alterar seu próprio status de admin' })

  const isAdmin = !!req.body.is_admin
  const [result] = await pool.query('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin, id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json({ ok: true })
}))

// DELETE /api/admin/users/:id — remove usuario (cascade apaga decks/colecao/partidas)
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.userId) return res.status(400).json({ error: 'Não é possível remover sua própria conta por aqui' })

  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.status(204).end()
}))

export default router
