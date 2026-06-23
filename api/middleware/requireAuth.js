import { verifyToken } from '../lib/auth.js'

// Exige header "Authorization: Bearer <token>". Em caso de sucesso,
// popula req.userId e req.userEmail. Usado em todas as rotas que tocam
// dados pertencentes a um usuário (decks, coleção, tags, partidas).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Token de autenticação ausente' })

  try {
    const payload = verifyToken(token)
    req.userId = payload.sub
    req.userEmail = payload.email
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}
