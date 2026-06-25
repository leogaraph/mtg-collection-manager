import { pool } from '../db.js'
import { asyncHandler } from './asyncHandler.js'

// Usar depois de requireAuth. Confere is_admin no banco (nao no token,
// pra revogar acesso admin sem esperar o JWT de 30d expirar).
export const requireAdmin = asyncHandler(async (req, res, next) => {
  const [[user]] = await pool.query('SELECT is_admin FROM users WHERE id = ?', [req.userId])
  if (!user?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' })
  next()
})
