import express from 'express'
import cors from 'cors'

import cardsRouter from './routes/cards.js'
import decksRouter from './routes/decks.js'
import tagsRouter from './routes/tags.js'
import collectionRouter from './routes/collection.js'
import syncRouter from './routes/sync.js'
import matchesRouter from './routes/matches.js'
import syncLogRouter from './routes/syncLog.js'
import scanRouter from './routes/scan.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' })) // coleções exportadas do Arena podem ter 10k+ entradas

app.use('/api/cards', cardsRouter)
app.use('/api/decks', decksRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/collection', collectionRouter)
app.use('/api/sync', syncRouter)
app.use('/api/matches', matchesRouter)
app.use('/api/sync-log', syncLogRouter)
app.use('/api/scan', scanRouter)

// 404 para rotas nao encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── ERROR HANDLER ───────────────────────────────────────────
// Middleware final: captura erros encaminhados por asyncHandler/next(err)
// e responde com JSON em vez de derrubar o processo.
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err)
  res.status(500).json({
    error: 'Internal server error',
    detail: err.sqlMessage || err.message || String(err),
  })
})

// Rede de seguranca extra: nunca deixa o processo morrer por erro nao tratado
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err)
})
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

const PORT = 3001
app.listen(PORT, () => console.log(`MTG API running on http://localhost:${PORT}`))
