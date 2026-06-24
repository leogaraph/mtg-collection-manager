import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = express.Router()
router.use(requireAuth)

// POST /api/sync-log { message }
router.post('/', asyncHandler(async (req, res) => {
  const { message } = req.body
  const [result] = await pool.query('INSERT INTO sync_log (message) VALUES (?)', [String(message || '').slice(0, 255)])
  res.json({ id: result.insertId })
}))

// GET /api/sync-log?since_id=
router.get('/', asyncHandler(async (req, res) => {
  const { since_id = 0 } = req.query
  const [rows] = await pool.query(
    'SELECT id, created_at, message FROM sync_log WHERE id > ? ORDER BY id ASC LIMIT 200',
    [Number(since_id)]
  )
  res.json(rows)
}))

export default router
