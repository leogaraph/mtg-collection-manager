import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js'

const router = express.Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/auth/register { email, password, name? }
router.post('/register', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const name = req.body.name ? String(req.body.name).trim() : null

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido' })
  if (password.length < 8) return res.status(400).json({ error: 'Senha precisa ter ao menos 8 caracteres' })

  const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
  if (existing) return res.status(409).json({ error: 'Já existe uma conta com esse email' })

  const passwordHash = await hashPassword(password)
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    [email, passwordHash, name]
  )
  const user = { id: result.insertId, email, name }
  res.status(201).json({ token: signToken(user), user })
}))

// POST /api/auth/login { email, password }
router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')

  const [[user]] = await pool.query('SELECT id, email, name, password_hash FROM users WHERE email = ?', [email])
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email ou senha incorretos' })
  }

  const { password_hash, ...publicUser } = user
  res.json({ token: signToken(user), user: publicUser })
}))

// GET /api/auth/me — valida o token atual e retorna o usuário
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.userId])
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json(user)
}))

// POST /api/auth/api-token { password } — gera um token de longa duração
// (~10 anos) para scripts/integrações que não fazem login interativo
// (mtga-tracker, sync_scryfall.py). Exige a senha de novo, mesmo já
// autenticado, para um token de sessão roubado não conseguir gerar um
// token permanente sem saber a senha real.
router.post('/api-token', requireAuth, asyncHandler(async (req, res) => {
  const password = String(req.body.password || '')
  const [[user]] = await pool.query('SELECT id, email, password_hash FROM users WHERE id = ?', [req.userId])
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Senha incorreta' })
  }
  res.json({ token: signToken(user, { longLived: true }) })
}))

export default router
