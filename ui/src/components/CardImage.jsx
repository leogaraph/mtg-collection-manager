import { useState } from 'react'

const PLACEHOLDER = 'https://cards.scryfall.io/normal/back/0/0/00000000-0000-0000-0000-000000000000.jpg?1562463522'

export function CardImage({ card, className = '', style = {} }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  // Tenta montar URL Scryfall a partir do scryfall_id se não tiver image_uri
  let src = card?.image_uri
  if (!src && card?.scryfall_id) {
    const id = card.scryfall_id
    src = `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`
  }
  if (!src || errored) src = PLACEHOLDER

  return (
    <img
      src={src}
      alt={card?.name || ''}
      className={`card-img rounded-lg ${loaded ? '' : 'card-img-loading'} ${className}`}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => { setErrored(true); setLoaded(true) }}
      loading="lazy"
    />
  )
}
