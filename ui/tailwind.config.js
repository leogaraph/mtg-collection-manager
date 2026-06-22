/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        arena: {
          ink:          '#070910',  // mais profundo (sombras, trilhos)
          bg:           '#0b0e18',  // fundo base
          panel:        '#141926',  // painéis / barras
          card:         '#1b2233',  // cards
          'card-hover': '#222b40',  // card em hover
          border:       '#2c3650',  // borda padrão
          'border-soft':'#222a3d',  // hairline sutil
          gold:         '#cfa454',  // dourado principal (mais quente/rico)
          'gold-light': '#ecc878',
          'gold-dark':  '#a07d38',
          parchment:    '#e8dcc0',  // creme p/ títulos premium
          blue:         '#5aa6d8',
          purple:       '#8a6ad0',
          green:        '#5fae74',
          red:          '#e06a55',
          text:         '#dfe3f0',
          'text-dim':   '#aab2c6',
          muted:        '#828ca6',
        },
        mana: {
          W: '#f4f0e2',
          U: '#4e9bcd',
          B: '#8b7bb5',
          R: '#e35d4a',
          G: '#5a9e6f',
          C: '#9aacb8',
        }
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:  '0 2px 8px rgba(0,0,0,0.4)',
        glow:  '0 0 0 1px rgba(207,164,84,0.35), 0 8px 28px rgba(207,164,84,0.12)',
        hover: '0 0 0 1px rgba(207,164,84,0.55), 0 14px 40px rgba(0,0,0,0.6)',
        panel: '0 10px 40px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg, #ecc878 0%, #cfa454 45%, #a07d38 100%)',
        'panel-grad': 'linear-gradient(180deg, #161c2b 0%, #121724 100%)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
