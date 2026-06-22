import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { CardImage } from '../components/CardImage'

// dHash 64-bit: redimensiona o recorte para 9x8 em escala de cinza e compara
// cada pixel com o vizinho da direita. Mesmo algoritmo do compute_phashes.py.
function dhashFromCanvas(sourceCanvas) {
  const w = 9, h = 8
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const ctx = small.getContext('2d')
  ctx.drawImage(sourceCanvas, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = []
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    gray.push(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2])
  }

  let bits = 0n
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = gray[row * w + col]
      const right = gray[row * w + col + 1]
      bits = (bits << 1n) | (left > right ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(16, '0')
}

export function ScannerView() {
  const videoRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState(null)
  const [added, setAdded] = useState({})

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then(s => {
        setStream(s)
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(e => setError('Não foi possível acessar a câmera: ' + e.message))

    return () => stream?.getTracks().forEach(t => t.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setScanning(true)
    setResults(null)
    setAdded({})

    // Recorta a área central na proporção de uma carta MTG (63mm x 88mm)
    const cardRatio = 63 / 88
    const vw = video.videoWidth, vh = video.videoHeight
    let cropH = vh * 0.9
    let cropW = cropH * cardRatio
    if (cropW > vw * 0.9) {
      cropW = vw * 0.9
      cropH = cropW / cardRatio
    }
    const sx = (vw - cropW) / 2
    const sy = (vh - cropH) / 2

    const canvas = document.createElement('canvas')
    canvas.width = cropW
    canvas.height = cropH
    canvas.getContext('2d').drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH)

    const phash = dhashFromCanvas(canvas)
    try {
      const matches = await api.scan(phash)
      setResults(matches)
    } catch (e) {
      setError('Erro ao buscar correspondências: ' + e.message)
    } finally {
      setScanning(false)
    }
  }

  const addToCollection = async (card) => {
    await api.setPhysical({ card_id: card.id, quantity: 1 })
    setAdded(a => ({ ...a, [card.id]: true }))
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-arena-gold font-bold text-xl mb-4" style={{ fontFamily: "'Cinzel', serif" }}>
          Scanner de Cartas
        </h2>

        {error && (
          <div className="bg-red-400/10 border border-red-400/40 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="relative bg-black rounded-xl overflow-hidden border border-arena-border">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-contain" />
          {/* Guia de enquadramento na proporção de uma carta MTG */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-arena-gold/70 rounded-lg" style={{ aspectRatio: '63 / 88', height: '90%' }} />
          </div>
        </div>

        <button
          onClick={capture}
          disabled={!stream || scanning}
          className="mt-4 w-full bg-arena-gold text-arena-bg font-semibold rounded-lg py-2.5 disabled:opacity-50 hover:brightness-110 transition"
        >
          {scanning ? 'Buscando...' : 'Capturar e identificar'}
        </button>

        {results && (
          <div className="mt-6 space-y-2">
            <h3 className="text-arena-muted text-sm uppercase tracking-wider">Possíveis correspondências</h3>
            {results.length === 0 && (
              <p className="text-arena-muted text-sm">Nenhuma carta correspondente encontrada.</p>
            )}
            {results.map(card => (
              <div key={card.id} className="flex items-center gap-3 bg-arena-card border border-arena-border rounded-lg p-2">
                <div className="w-12 flex-shrink-0">
                  <CardImage card={card} className="w-full rounded" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-arena-text text-sm font-medium truncate">{card.name}</p>
                  <p className="text-arena-muted text-xs">
                    {card.set_name} · #{card.collector_number} · distância {card.distance}
                  </p>
                </div>
                <button
                  onClick={() => addToCollection(card)}
                  disabled={added[card.id]}
                  className="text-xs px-3 py-1.5 rounded border border-arena-gold/40 text-arena-gold hover:bg-arena-gold/10 disabled:opacity-50 transition flex-shrink-0"
                >
                  {added[card.id] ? 'Adicionada' : 'Adicionar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
