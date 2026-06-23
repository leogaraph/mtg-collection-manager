import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { recomputeAutoTags } from '../lib/autoTags.js'

const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, COUNT(ct.card_id) AS card_count
     FROM tags t LEFT JOIN card_tags ct ON ct.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.is_auto DESC, card_count DESC`
  )
  res.json(rows)
}))

// POST /api/tags/auto — recalcula todas as tags automáticas:
// staple/meta + tags funcionais por oracle_text + uma tag por keyword literal.
router.post('/auto', asyncHandler(async (req, res) => {
  const result = await recomputeAutoTags(pool)
  res.json({ ok: true, tagged: result })
}))

// POST /api/tags — cria tag avulsa { name, color?, description? }
router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase().replace(/^#/, '')
  if (!name) return res.status(400).json({ error: 'name é obrigatório' })
  const { color = null, description = null } = req.body

  const [[existing]] = await pool.query('SELECT id FROM tags WHERE name = ?', [name])
  if (existing) return res.status(409).json({ error: 'Tag já existe', id: existing.id })

  const [result] = await pool.query(
    'INSERT INTO tags (name, color, description) VALUES (?,?,?)',
    [name, color, description]
  )
  const [[tag]] = await pool.query('SELECT * FROM tags WHERE id = ?', [result.insertId])
  res.status(201).json(tag)
}))

// PATCH /api/tags/:id — renomeia / recoloriza / descreve { name?, color?, description? }
router.patch('/:id', asyncHandler(async (req, res) => {
  const [[tag]] = await pool.query('SELECT * FROM tags WHERE id = ?', [req.params.id])
  if (!tag) return res.status(404).json({ error: 'Tag não encontrada' })

  const updates = {}
  if (req.body.name !== undefined) {
    const newName = String(req.body.name).trim().toLowerCase().replace(/^#/, '')
    if (!newName) return res.status(400).json({ error: 'name inválido' })
    const [[clash]] = await pool.query('SELECT id FROM tags WHERE name = ? AND id <> ?', [newName, req.params.id])
    if (clash) return res.status(409).json({ error: 'Já existe outra tag com esse nome' })
    updates.name = newName
  }
  if (req.body.color !== undefined)       updates.color = req.body.color
  if (req.body.description !== undefined) updates.description = req.body.description

  const cols = Object.keys(updates)
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })

  await pool.query(
    `UPDATE tags SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map(c => updates[c]), req.params.id]
  )
  const [[updated]] = await pool.query('SELECT * FROM tags WHERE id = ?', [req.params.id])
  res.json(updated)
}))

// DELETE /api/tags/:id — remove a tag (card_tags cai por cascade).
// Obs: tags automáticas (staple/meta) podem voltar ao rodar POST /api/tags/auto.
router.delete('/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM tags WHERE id = ?', [req.params.id])
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Tag não encontrada' })
  res.json({ ok: true, removed: true })
}))

export default router
