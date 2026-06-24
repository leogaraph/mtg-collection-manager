import express from 'express'

import authRouter from './routes/auth.js'
import cardsRouter from './routes/cards.js'
import decksRouter from './routes/decks.js'
import tagsRouter from './routes/tags.js'
import collectionRouter from './routes/collection.js'
import syncRouter from './routes/sync.js'
import matchesRouter from './routes/matches.js'
import syncLogRouter from './routes/syncLog.js'
import scanRouter from './routes/scan.js'

const app = express()
app.set('trust proxy', 1) // atrás do nginx/Cloudflare: usa X-Forwarded-For como IP real

// Sem CORS: a UI fala com a API pela MESMA origem (nginx faz proxy de /api).
// Isso já bloqueia chamadas cross-origin de outros sites — não precisa de lib.

// Rate limit simples em memória. Sem dependência externa; suficiente para
// uso pessoal/familiar (e a Cloudflare ainda filtra na borda). Protege o
// login contra brute-force e a API contra flood. Cada chamada cria seu
// próprio Map — limiters diferentes não compartilham contador.
const rateLimit = (max, windowMs) => {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    if (hits.size > 5000) hits.clear() // guarda contra crescimento ilimitado do Map
    const rec = hits.get(req.ip)
    if (!rec || now > rec.reset) hits.set(req.ip, { n: 1, reset: now + windowMs })
    else if (++rec.n > max) return res.status(429).json({ error: 'Muitas requisições — tente novamente em alguns minutos' })
    next()
  }
}
app.use('/api', rateLimit(600, 15 * 60 * 1000))        // geral
app.use('/api/auth', rateLimit(100, 15 * 60 * 1000))   // mais agressivo no login (brute-force)

// Import da coleção do Arena pode ter 10k+ cartas (payload grande); o resto
// da API fica em 1mb pra reduzir superfície de DoS por corpo enorme.
app.use('/api/collection/import-arena', express.json({ limit: '25mb' }))
app.use(express.json({ limit: '1mb' }))

app.use('/api/auth', authRouter)
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
// Loga o detalhe no servidor; só devolve a mensagem técnica (sqlMessage,
// nomes de tabela/coluna) fora de produção. Em produção (NODE_ENV=production)
// o cliente recebe só "Internal server error".
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err)
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { detail: err.sqlMessage || err.message || String(err) }),
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
