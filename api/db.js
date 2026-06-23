import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'

// Diretorio de imagens das cartas (montado como volume compartilhado com a UI)
export const IMG_DIR = path.join(process.cwd(), 'public', 'cards')
fs.mkdirSync(IMG_DIR, { recursive: true })

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'mtg',
  password: process.env.DB_PASS     || 'change_me_password',
  database: process.env.DB_NAME     || 'mtg_collection',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
})
