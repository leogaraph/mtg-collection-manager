import express from 'express'
import { pool } from '../db.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { recomputeAutoTags } from '../lib/autoTags.js'
import {
  scryfallFetchBatch, scryfallFetchOne, extractCardData, downloadCardImage,
} from '../lib/scryfall.js'

const router = express.Router()

// ─── Job de sincronização em background (estado em memória) ───
let syncJob = null // { mode, total, processed, updated, images, errors, errorNames, done, startedAt, finishedAt }

async function runSyncJob(job, cards) {
  const BATCH = 75

  for (let start = 0; start < cards.length; start += BATCH) {
    const batch = cards.slice(start, start + BATCH)
    const idByName = new Map(batch.map(c => [c.name.toLowerCase(), c.id]))

    let scryfallData
    try {
      scryfallData = await scryfallFetchBatch(batch.map(c => c.name))
    } catch {
      scryfallData = {}
    }

    for (const [nameLower, cardId] of idByName) {
      let sc = scryfallData[nameLower]
      if (!sc) {
        const origName = batch.find(c => c.name.toLowerCase() === nameLower).name
        sc = await scryfallFetchOne(origName)
        if (!sc) { job.errors++; job.errorNames.push(origName); job.processed++; continue }
      }

      const data = extractCardData(sc)
      const imgUrl = data._img_url
      delete data._img_url

      if (imgUrl && data.scryfall_id) {
        const localImg = await downloadCardImage(data.scryfall_id, imgUrl)
        if (localImg) { data.image_uri = localImg; job.images++ }
        else data.image_uri = imgUrl
      }

      data.last_synced_at = new Date()

      const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
      const setSql = entries.map(([k]) => `${k} = ?`).join(', ')
      const values = entries.map(([, v]) => v)
      try {
        await pool.query(`UPDATE cards SET ${setSql}, updated_at = NOW() WHERE id = ?`, [...values, cardId])
        job.updated++
      } catch (err) {
        // ex: scryfall_id duplicado (carta com nome ligeiramente diferente
        // ja sincronizada sob outro registro) - nao derruba o sync inteiro
        job.errors++
        job.errorNames.push(`${batch.find(c => c.id === cardId)?.name || cardId}: ${err.sqlMessage || err.message}`)
      }
      job.processed++
    }
  }

  // Recalcula tags automaticas (keywords + heuristicas funcionais) com os
  // dados recem-sincronizados, para que cartas importadas/sincronizadas ja
  // apareçam com flying/ramp/draw/etc sem acao manual.
  try {
    await recomputeAutoTags(pool)
  } catch (err) {
    job.errorNames.push(`Recalculo de tags falhou: ${err.message}`)
  }

  job.done = true
  job.finishedAt = new Date()
}

// POST /api/sync  body: { mode: 'new' | 'all' }  (default 'new')
// 'new'  -> so cartas com scryfall_id IS NULL (ex: apos importar um deck)
// 'all'  -> ressincroniza todas as cartas (precos, imagens, etc) em background, com progresso via /api/sync/progress
router.post('/', asyncHandler(async (req, res) => {
  const mode = req.body?.mode === 'all' ? 'all' : 'new'

  if (syncJob && !syncJob.done) {
    return res.status(409).json({ error: 'Já existe uma sincronização em andamento', job: syncJob })
  }

  const [cards] = await pool.query(
    mode === 'all'
      ? 'SELECT id, name FROM cards ORDER BY name'
      : 'SELECT id, name FROM cards WHERE scryfall_id IS NULL ORDER BY name'
  )

  syncJob = {
    mode, total: cards.length, processed: 0, updated: 0, images: 0,
    errors: 0, errorNames: [], done: false, startedAt: new Date(), finishedAt: null,
  }

  // roda em background, nao bloqueia a resposta
  runSyncJob(syncJob, cards).catch(err => {
    syncJob.done = true
    syncJob.finishedAt = new Date()
    syncJob.errors++
    syncJob.errorNames.push(`Job interrompido: ${err.message}`)
  })

  res.json({ started: true, mode, total: cards.length })
}))

// GET /api/sync/progress -> estado da sincronização em andamento (ou da última concluída)
router.get('/progress', asyncHandler(async (req, res) => {
  res.json(syncJob || { done: true, total: 0, processed: 0 })
}))

// GET /api/sync/status -> quantas cartas ainda nao foram sincronizadas + ultima sync
router.get('/status', asyncHandler(async (req, res) => {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM cards')
  const [[{ unsynced }]] = await pool.query('SELECT COUNT(*) AS unsynced FROM cards WHERE scryfall_id IS NULL')
  const [[{ oldestSync }]] = await pool.query('SELECT MIN(last_synced_at) AS oldestSync FROM cards')
  res.json({ total, unsynced, oldestSync })
}))

export default router
