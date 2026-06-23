import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Em produção real, defina JWT_SECRET no .env. Sem isso, gera um segredo
// por processo (sessões existentes invalidam a cada restart da API —
// aceitável para uso pessoal/dev, não para produção multi-usuário real).
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[AVISO] JWT_SECRET não definido no .env — usando segredo aleatório por processo (sessões não sobrevivem a um restart da API). Defina JWT_SECRET no .env para produção.')
  return Math.random().toString(36) + Math.random().toString(36)
})()

const TOKEN_TTL = '30d'

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET) // lança se inválido/expirado
}
