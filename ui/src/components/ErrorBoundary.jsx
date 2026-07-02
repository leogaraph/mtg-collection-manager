import { Component } from 'react'

// Sem isso, qualquer erro de render (dado inesperado, chunk de deploy velho,
// bug pontual) derruba a árvore inteira e deixa a tela em branco, sem
// nenhum feedback pro usuário. Isso vira a única rede de segurança.
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erro não tratado:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="panel max-w-md w-full p-6 text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <h2 className="text-arena-text font-semibold mb-1">Algo deu errado</h2>
          <p className="text-arena-muted text-sm mb-4">
            {this.state.error.message || 'Erro inesperado ao carregar a página.'}
          </p>
          <button onClick={() => window.location.reload()} className="btn-gold">
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}
