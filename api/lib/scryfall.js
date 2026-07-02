// ─── Cliente Scryfall: busca de dados + download de imagem ────
import fs from 'fs'
import path from 'path'
import { IMG_DIR } from '../db.js'

export const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection'
export const SCRYFALL_NAMED = 'https://api.scryfall.com/cards/named'
export const SYNC_DELAY = 120 // ms entre requests (Scryfall pede >= 100ms)
export const SYNC_HEADERS = { 'User-Agent': 'MTGCollectionManager/1.0', Accept: 'application/json' }

export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export async function scryfallFetchBatch(names) {
  const resp = await fetch(SCRYFALL_COLLECTION, {
    method: 'POST',
    headers: { ...SYNC_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: names.map(n => ({ name: n })) }),
  })
  const data = await resp.json()
  const result = {}
  for (const card of data.data || []) result[card.name.toLowerCase()] = card
  await sleep(SYNC_DELAY)
  return result
}

export async function scryfallFetchOne(name) {
  try {
    let resp = await fetch(`${SCRYFALL_NAMED}?exact=${encodeURIComponent(name)}`, { headers: SYNC_HEADERS })
    if (resp.status === 404) {
      resp = await fetch(`${SCRYFALL_NAMED}?fuzzy=${encodeURIComponent(name)}`, { headers: SYNC_HEADERS })
    }
    await sleep(SYNC_DELAY)
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

export function extractCardData(sc) {
  // Imagem: prefere 'normal'; DFC usa a face frontal
  let imgUrl = null
  if (sc.image_uris) {
    imgUrl = sc.image_uris.normal || sc.image_uris.large || sc.image_uris.small
  } else if (sc.card_faces?.[0]?.image_uris) {
    const fu = sc.card_faces[0].image_uris
    imgUrl = fu.normal || fu.large
  }

  const prices = sc.prices || {}
  const oracleText = sc.oracle_text ?? (sc.card_faces?.map(f => f.oracle_text).filter(Boolean).join('\n//\n') || null)
  const manaCost = sc.mana_cost || (sc.card_faces?.map(f => f.mana_cost).filter(Boolean).join(' // ') || null)

  return {
    scryfall_id: sc.id,
    oracle_id: sc.oracle_id ?? null,
    layout: sc.layout ?? null,
    cmc: sc.cmc ?? null,
    keywords: JSON.stringify(sc.keywords || []),
    colors: (sc.colors || []).join(',') || null,
    color_identity: (sc.color_identity || []).join(',') || null,
    produced_mana: (sc.produced_mana || []).join(',') || null,
    type_line: sc.type_line ?? null,
    oracle_text: oracleText,
    mana_cost: manaCost,
    set_code: sc.set ?? null,
    set_name: sc.set_name ?? null,
    collector_number: sc.collector_number ?? null,
    rarity: sc.rarity ?? null,
    released_at: sc.released_at ?? null,
    artist: sc.artist ?? null,
    flavor_text: sc.flavor_text ?? null,
    edhrec_rank: sc.edhrec_rank ?? null,
    price_usd: prices.usd ?? null,
    price_usd_foil: prices.usd_foil ?? null,
    price_eur: prices.eur ?? null,
    foil: sc.foil ?? false,
    nonfoil: sc.nonfoil ?? true,
    _img_url: imgUrl,
  }
}

export async function downloadCardImage(scryfallId, url) {
  const localPath = path.join(IMG_DIR, `${scryfallId}.jpg`)
  if (fs.existsSync(localPath)) return `/cards/${scryfallId}.jpg`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(localPath, buf)
    return `/cards/${scryfallId}.jpg`
  } catch {
    return null
  }
}
