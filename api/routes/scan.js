import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

const router = express.Router()

// Distância de Hamming entre dois hashes hex de 64 bits
function hammingDistance(hexA, hexB) {
  let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB)
  let count = 0
  while (x) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

// POST /api/scan { phash: "16 hex chars" } → top 5 cards mais próximos por dHash
router.post('/', asyncHandler(async (req, res) => {
  const { phash } = req.body
  if (!/^[0-9a-f]{16}$/i.test(phash || '')) {
    return res.status(400).json({ error: 'phash inválido (esperado hex de 16 chars)' })
  }

  const [rows] = await pool.query(`
    SELECT id, name, set_code, set_name, collector_number, image_uri, phash
    FROM cards WHERE phash IS NOT NULL
  `)

  const top = rows
    .map(r => ({ ...r, distance: hammingDistance(phash, r.phash) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ phash, ...r }) => r)

  res.json(top)
}))

export default router
