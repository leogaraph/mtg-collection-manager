// Estilo visual de uma tag. As auto-tags (staple/meta) têm cor fixa e ícone;
// as tags pessoais recebem uma cor estável derivada do nome (hash).

const AUTO = {
  staple: { color: '#cfa454', icon: '★', label: 'staple' },
  meta:   { color: '#8a6ad0', icon: '◆', label: 'meta' },
}

// paleta agradável p/ tags pessoais
const PALETTE = ['#5aa6d8', '#5fae74', '#d8915a', '#c879a6', '#6aa0c8', '#b0995a', '#7fae6a', '#c87a6a']

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

// Recebe o nome da tag e (opcional) o registro vindo de /api/tags com {color,is_auto}
export function tagStyle(name, meta) {
  const key = String(name || '').toLowerCase()
  if (AUTO[key]) return { ...AUTO[key], auto: true }
  const color = meta?.color || PALETTE[hash(key) % PALETTE.length]
  return { color, icon: null, auto: Boolean(meta?.is_auto), label: key }
}

// estilo inline (cor de texto + fundo translúcido + borda) para um chip de tag
export function tagChipStyle(name, meta) {
  const { color } = tagStyle(name, meta)
  return {
    color,
    backgroundColor: color + '1f',      // ~12% alpha
    borderColor: color + '55',          // ~33% alpha
  }
}
