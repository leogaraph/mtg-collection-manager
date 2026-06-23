import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, q, source = 'digital' } = req.query
  const table = source === 'physical' ? 'collection_physical' : 'collection_digital'
  let where = '1=1'
  const params = []
  if (q) { where += ' AND c.name LIKE ?'; params.push(`%${q}%`) }
  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.mana_cost, c.colors, c.type_line, c.image_uri,
           c.rarity, c.price_usd, col.quantity${source === 'physical' ? ', col.condition, col.finish' : ', col.platform'}
    FROM ${table} col
    JOIN cards c ON c.id = col.card_id
    WHERE ${where}
    ORDER BY c.name LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  )
  res.json(rows)
}))

// POST /api/collection/physical  body: { card_id, quantity, condition, finish, lang, notes, acquired_price, acquired_at }
// Upsert: cria ou atualiza a entrada da coleção física para uma carta.
// quantity <= 0 remove a entrada.
router.post('/physical', asyncHandler(async (req, res) => {
  const { card_id, quantity = 1, condition = 'NM', finish = 'nonfoil', lang = 'en', notes, acquired_price, acquired_at } = req.body
  if (!card_id) return res.status(400).json({ error: 'card_id é obrigatório' })

  if (Number(quantity) <= 0) {
    await pool.query('DELETE FROM collection_physical WHERE card_id = ?', [card_id])
    return res.json({ ok: true, removed: true })
  }

  await pool.query(
    `INSERT INTO collection_physical (card_id, quantity, \`condition\`, finish, lang, notes, acquired_price, acquired_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), \`condition\`=VALUES(\`condition\`),
       finish=VALUES(finish), lang=VALUES(lang), notes=VALUES(notes),
       acquired_price=VALUES(acquired_price), acquired_at=VALUES(acquired_at)`,
    [card_id, quantity, condition, finish, lang, notes ?? null, acquired_price ?? null, acquired_at ?? null]
  )
  res.json({ ok: true })
}))

// DELETE /api/collection/physical/:cardId
router.delete('/physical/:cardId', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM collection_physical WHERE card_id = ?', [req.params.cardId])
  res.json({ ok: true })
}))

// POST /api/collection/digital  body: { card_id, quantity, platform }
// Upsert: cria ou atualiza a entrada da coleção digital para uma carta/plataforma.
// quantity <= 0 remove a entrada.
router.post('/digital', asyncHandler(async (req, res) => {
  const { card_id, quantity = 1, platform = 'arena' } = req.body
  if (!card_id) return res.status(400).json({ error: 'card_id é obrigatório' })

  if (Number(quantity) <= 0) {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ? AND platform = ?', [card_id, platform])
    return res.json({ ok: true, removed: true })
  }

  await pool.query(
    `INSERT INTO collection_digital (card_id, quantity, platform)
     VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
    [card_id, quantity, platform]
  )
  res.json({ ok: true })
}))

// DELETE /api/collection/digital/:cardId?platform=arena
// Sem platform, remove todas as entradas digitais da carta.
router.delete('/digital/:cardId', asyncHandler(async (req, res) => {
  const { platform } = req.query
  if (platform) {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ? AND platform = ?', [req.params.cardId, platform])
  } else {
    await pool.query('DELETE FROM collection_digital WHERE card_id = ?', [req.params.cardId])
  }
  res.json({ ok: true })
}))

// ─── IMPORT COLEÇÃO DO ARENA ─────────────────────────────────
// Body esperado: { entries: [{ name, set?, count }, ...] } — formato gerado
// pelo MTGA-collection-exporter (mtga_collection.json). Pode ter 10k+
// entradas, então roda em background (mesmo padrao do /api/sync) com
// progresso via GET /api/collection/import-progress, em vez de segurar a
// conexao HTTP e travar o event loop com milhares de queries sequenciais.

let importJob = null // { total, processed, updated, newCards, errors, done, startedAt, finishedAt }

async function runImportJob(job, byName) {
  const BATCH = 200
  const items = [...byName.entries()]

  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const [name, qty] of batch) {
        try {
          const [rows] = await conn.query('SELECT id FROM cards WHERE name = ? LIMIT 1', [name])
          let cardId
          if (rows.length) {
            cardId = rows[0].id
          } else {
            const [result] = await conn.query('INSERT INTO cards (name) VALUES (?)', [name])
            cardId = result.insertId
            job.newCards++
          }
          await conn.query(
            `INSERT INTO collection_digital (card_id, quantity, platform)
             VALUES (?, ?, 'arena')
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_at = NOW()`,
            [cardId, qty]
          )
          job.updated++
        } catch (e) {
          job.errors++
        }
        job.processed++
      }
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      job.errors += batch.length
      job.processed = Math.min(job.total, job.processed + batch.length)
    } finally {
      conn.release()
    }
  }

  job.done = true
  job.finishedAt = new Date()
}

// POST /api/collection/import-arena  body: { entries: [...] }
// Inicia a importacao em background e retorna na hora; acompanhe com
// GET /api/collection/import-progress.
router.post('/import-arena', asyncHandler(async (req, res) => {
  const entries = req.body?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Envie { entries: [...] } com o conteúdo de mtga_collection.json' })
  }
  if (importJob && !importJob.done) {
    return res.status(409).json({ error: 'Já existe uma importação em andamento', job: importJob })
  }

  const byName = new Map()
  for (const e of entries) {
    const name = String(e?.name || '').trim()
    const count = Number(e?.count) || 0
    if (!name || count <= 0) continue
    byName.set(name, (byName.get(name) || 0) + count)
  }
  if (byName.size === 0) {
    return res.status(400).json({ error: 'Nenhuma entrada válida (name + count > 0) encontrada' })
  }

  importJob = {
    total: byName.size, processed: 0, updated: 0, newCards: 0, errors: 0,
    done: false, startedAt: new Date(), finishedAt: null,
  }

  runImportJob(importJob, byName).catch(err => {
    importJob.done = true
    importJob.finishedAt = new Date()
    importJob.errors++
  })

  res.json({ started: true, total: byName.size })
}))

// GET /api/collection/import-progress -> estado da importação em andamento (ou da última concluída)
router.get('/import-progress', asyncHandler(async (req, res) => {
  res.json(importJob || { done: true, total: 0, processed: 0 })
}))

export default router
